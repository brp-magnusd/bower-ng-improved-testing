/**
 * @license ngImprovedTesting
 * (c) 2014 Emil van Galen. https://github.com/evangalen/ng-improved-testing
 * License: MIT
 */
(function() { 'use strict';

angular.module('ngImprovedTesting', ['ngImprovedTesting.$q']);

/* global afterEach:true */
var ngImprovedTestingConfigFlags = {
    $qTick: false
};

var ngImprovedTestingConfig = {
    $qTickEnable: function() {
        afterEach(function() {
            ngImprovedTestingConfigFlags.$qTick = false;
        });

        return function() {
            ngImprovedTestingConfigFlags.$qTick = true;
        };
    }
};

angular.module('ngImprovedTesting.internal.config', [])
    .constant('ngImprovedTestingConfigFlags', ngImprovedTestingConfigFlags)
    .constant('ngImprovedTestingConfig', ngImprovedTestingConfig);

/**
 * @ngdoc service
 * @constructor
 */
function MockCreator() {

    /**
     * @param {*} value
     * @returns {boolean}
     */
    this.canInstanceBeMocked = function (value) {
        return angular.isFunction(value) || isObjectWithMethods(value);
    };

    /**
     * @param {(Function|Object)} value
     * @returns {(Function|Object)}
     */
    this.mockInstance = function (value) {
        if (angular.isFunction(value)) {
            return createFunctionMock(value);
        } else if (isObjectWithMethods(value)) {
            return createObjectMock(value);
        } else {
            throw 'Could not mock provided value: ' + value;
        }
    };

    function isObjectWithMethods(value) {
        if (!angular.isObject(value)) {
            return false;
        }

        for (var propertyName in value) { // jshint ignore:line
            var propertyValue = value[propertyName];

            if (angular.isFunction(propertyValue) && propertyName !== 'constructor' &&
                    propertyValue !== Object.prototype[propertyName]) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param {Function} value
     * @returns {Function}
     */
    function createFunctionMock(value) {
        if (!hasProperties(value) && !hasProperties(value.prototype, 'constructor')) {
            return jasmine.createSpy();
        }

        var Constructor = jasmine.createSpy();

        copyPropertiesAndReplaceWithSpies(value, Constructor, true);

        Constructor.prototype = Object.create(value.prototype);
        copyPropertiesAndReplaceWithSpies(value.prototype, Constructor.prototype, true, 'constructor');
        Constructor.prototype.constructor = value.prototype.constructor;

        return Constructor;
    }

    /**
     * @param {Object} obj
     * @param {...string} ignoreProperties
     */
    function hasProperties(obj, ignoreProperties) {
        for (var propertyName in obj) {
            if (obj.hasOwnProperty(propertyName) &&
                    (!ignoreProperties || ignoreProperties.indexOf(propertyName) === -1)) {
                return true;
            }
        }

        return false;
    }

    function createObjectMock(obj) {
        var result = {};

        copyPropertiesAndReplaceWithSpies(obj, result, false, 'constructor');

        return result;
    }

    /**
     * @param {Object} source
     * @param {Object} target
     * @param {boolean} onlyOwnProperties
     * @param {...string} ignoreProperties
     */
    function copyPropertiesAndReplaceWithSpies(source, target, onlyOwnProperties, ignoreProperties) {
        ignoreProperties = Array.prototype.slice.call(arguments, 3);

        for (var propertyName in source) { // jshint ignore:line
            if (onlyOwnProperties && !source.hasOwnProperty(propertyName)) {
                continue;
            }

            var propertyValue = source[propertyName];

            if ((onlyOwnProperties || (!onlyOwnProperties && propertyValue !== Object.prototype[propertyName])) &&
                    (!ignoreProperties || ignoreProperties.indexOf(propertyName) === -1)) {
                if (angular.isFunction(propertyValue)) {
                    target[propertyName] = jasmine.createSpy(propertyName);
                } else {
                    target[propertyName] = propertyValue;
                }
            }
        }
    }
}

angular.module('ngImprovedTesting.internal.mockCreator', [])
    .service('mockCreator', MockCreator);

var numberOfBuildModules = 0;

// @ngInject
function moduleIntrospectorFactory(moduleIntrospector, mockCreator) {

    /**
     * @constructor
     */
    function ModuleBuilder(moduleName) {

        /**
         * @param {string} providerName
         * @param {string} componentName
         * @param {string} componentKind
         * @param {string} [dependenciesUsage]
         * @param {Array.<string>} [dependencies]
         */
        function includeProviderComponent(providerName, componentName, componentKind, dependenciesUsage, dependencies) {
            var toBeIncludedModuleComponent = {
                providerName: providerName,
                componentName: componentName,
                componentKind: componentKind
            };

            if (dependenciesUsage) {
                toBeIncludedModuleComponent.dependenciesUsage = dependenciesUsage;
                toBeIncludedModuleComponent.dependencies = dependencies;
            }

            toBeIncludedModuleComponents.push(toBeIncludedModuleComponent);
        }

        function ensureNotAConstantOrValueService(serviceName) {
            var providerMethod = introspector.getProviderComponentDeclaration('$provide', serviceName).providerMethod;

            if (providerMethod === 'constant' || providerMethod === 'value') {
                throw 'Services declared with "contact" or "value" are not supported';
            }
        }


        /** @type {angular.Module} */
        var originalModule = angular.module(moduleName);

        var injector = /** @type {$injector} */ angular.injector(['ng', 'ngMock', moduleName]);

        var introspector = moduleIntrospector(moduleName);

        /**
         * @name ModuleBuilder.ToBeIncludedModuleComponent
         * @typedef {Object}
         * @property {string} type
         * @property {string} componentName
         * @property {string} componentKind
         * @property {(undefined|string)} dependenciesUsage
         * @property {(undefined|Array.<string>)} dependencies
         */

        /** @type {Object.<ModuleBuilder.ToBeIncludedModuleComponent>} */
        var toBeIncludedModuleComponents = [];

        //TODO: comment
        this.serviceWithMocks = function(serviceName) {
            ensureNotAConstantOrValueService(serviceName);
            includeProviderComponent('$provide', serviceName, 'withMocks');
            return this;
        };

        /**
         * Includes a service that replaces the dependencies specified in <em>toBeMockedDependencies</em> with mock
         * implementations.
         *
         * NOTE: services from AngularJS itself will never be mocked.
         *
         * @param {string} serviceName the name of the service to be registered
         * @param {...string} toBeMockedDependencies dependencies to be replaced with a mock implementation
         * @returns {moduleIntrospectorFactory.ModuleBuilder} the module builder instance
         */
        this.serviceWithMocksFor = function(serviceName, toBeMockedDependencies) {
            ensureNotAConstantOrValueService(serviceName);
            toBeMockedDependencies = Array.prototype.slice.call(arguments, 1);
            includeProviderComponent('$provide', serviceName, 'withMocks', 'for', toBeMockedDependencies);
            return this;
        };

        //TODO: comment
        this.serviceWithMocksExcept = function(serviceName, notToBeMockedDependencies) {
            ensureNotAConstantOrValueService(serviceName);
            notToBeMockedDependencies = Array.prototype.slice.call(arguments, 1);
            includeProviderComponent('$provide', serviceName, 'withMocks', 'except', notToBeMockedDependencies);
            return this;
        };

        /**
         * Including an actual service (and not a mocked one) in the module
         *
         * @param {string} serviceName name of the service to be included in the to be build module
         * @returns {moduleIntrospectorFactory.ModuleBuilder}
         */
        this.serviceAsIs = function(serviceName) {
            includeProviderComponent('$provide', serviceName, 'asIs');
            return this;
        };

        //TODO: comment
        this.filterWithMocks = function(filterName) {
            includeProviderComponent('$filterProvider', filterName, 'withMocks');
            return this;
        };

        /**
         * Includes a filter that replaces the dependencies specified in <em>toBeMockedDependencies</em> with mock
         * implementations.
         *
         * NOTE: services from AngularJS itself will never be mocked
         *
         * @param {string} filterName name of the filter to be included in the to be build module
         * @param {...string} toBeMockedDependencies dependencies to be replaced with a mock implementation
         * @returns {moduleIntrospectorFactory.ModuleBuilder} the module builder instance
         */
        this.filterWithMocksFor = function(filterName, toBeMockedDependencies) {
            includeProviderComponent('$filterProvider', filterName, 'withMocks', 'for', toBeMockedDependencies);
            return this;
        };

        //TODO: comment
        this.filterWithMocksExcept = function(filterName, notToBeMockedDependencies) {
            includeProviderComponent('$filterProvider', filterName, 'withMocks', 'except', notToBeMockedDependencies);
            return this;
        };

        /**
         * Including an actual filter (and not a mocked one) in the module
         *
         * @param {string} filterName name of the filter to be included in the to be build module
         * @returns {moduleIntrospectorFactory.ModuleBuilder}
         */
        this.filterAsIs = function(filterName) {
            includeProviderComponent('$filterProvider', filterName, 'asIs');
            return this;
        };

        //TODO: comment
        this.controllerWithMocks = function(controllerName) {
            includeProviderComponent('$controllerProvider', controllerName, 'withMocks');
            return this;
        };

        /**
         * Includes a controller that uses mocked service dependencies (instead of actual services) in the module.
         *
         * @param {string} controllerName name of the controller to be included in the to be build module
         * @param {...string} toBeMockedDependencies dependencies to be replaced with a mock implementation
         * @returns {moduleIntrospectorFactory.ModuleBuilder}
         */
        this.controllerWithMocksFor = function(controllerName, toBeMockedDependencies) {
            toBeMockedDependencies = Array.prototype.slice.call(arguments, 1);
            includeProviderComponent('$controllerProvider', controllerName, 'withMocks', 'for', toBeMockedDependencies);
            return this;
        };

        //TODO: comment
        this.controllerWithMocksExcept = function(controllerName, toBeMockedDependencies) {
            includeProviderComponent('$controllerProvider', controllerName, 'withMocks', 'except', toBeMockedDependencies);
            return this;
        };

        /**
         * Including an actual controller (and not a mocked one) in the module
         *
         * @param {string} controllerName name of the controller to be included in the to be build module
         * @returns {moduleIntrospectorFactory.ModuleBuilder}
         */
        this.controllerAsIs = function(controllerName) {
            includeProviderComponent('$controllerProvider', controllerName, 'asIs');
            return this;
        };

        //TODO: comment
        this.directiveWithMocks = function(directiveName) {
            includeProviderComponent('$compileProvider', directiveName, 'withMocks');
            return this;
        };

        /**
         * Includes a directive that uses mocked service dependencies (instead of actual services) in the module.
         *
         * @param {string} directiveName name of the controller to be included in the to be build module
         * @param {...string} toBeMockedDependencies dependencies to be replaced with a mock implementation
         * @returns {moduleIntrospectorFactory.ModuleBuilder}
         */
        this.directiveWithMocksFor = function(directiveName, toBeMockedDependencies) {
            toBeMockedDependencies = Array.prototype.slice.call(arguments, 1);
            includeProviderComponent('$compileProvider', directiveName, 'withMocks', 'for', toBeMockedDependencies);
            return this;
        };

        //TODO: comment
        this.directiveWithMocksExcept = function(directiveName, toBeMockedDependencies) {
            includeProviderComponent('$compileProvider', directiveName, 'withMocks', 'except', toBeMockedDependencies);
            return this;
        };

        /**
         * Including an actual directive (and not a mocked one) in the module
         *
         * @param {string} directiveName name of the directive to be included in the to be build module
         * @returns {moduleIntrospectorFactory.ModuleBuilder}
         */
        this.directiveAsIs = function(directiveName) {
            includeProviderComponent('$compileProvider', directiveName, 'asIs');
            return this;
        };

        //TODO: comment
        this.animationWithMocks = function(animationName) {
            includeProviderComponent('$animateProvider', animationName, 'withMocks');
            return this;
        };

        /**
         * Includes a animation that uses mocked service dependencies (instead of actual services) in the module.
         *
         * @param {string} animationName name of the controller to be included in the to be build module
         * @param {...string} toBeMockedDependencies dependencies to be replaced with a mock implementation
         * @returns {moduleIntrospectorFactory.ModuleBuilder}
         */
        this.animationWithMocksFor = function(animationName, toBeMockedDependencies) {
            toBeMockedDependencies = Array.prototype.slice.call(arguments, 1);
            includeProviderComponent('$animateProvider', animationName, 'withMocks', 'for', toBeMockedDependencies);
            return this;
        };

        //TODO: comment
        this.animationWithMocksExcept = function(animationName, toBeMockedDependencies) {
            includeProviderComponent('$animateProvider', animationName, 'withMocks', 'except', toBeMockedDependencies);
            return this;
        };

        /**
         * Including an actual animation (and not a mocked one) in the module
         *
         * @param {string} animationName name of the animation to be included in the to be build module
         * @returns {moduleIntrospectorFactory.ModuleBuilder}
         */
        this.animationAsIs = function(animationName) {
            includeProviderComponent('$animateProvider', animationName, 'asIs');
            return this;
        };


        /**
         * Builds ...
         * @returns {Function}
         */
        this.build = function() {

            function handleAsIsComponentKind(toBeIncludedModuleComponent) {
                var providerName = toBeIncludedModuleComponent.providerName;
                var componentName = toBeIncludedModuleComponent.componentName;

                if (providerName === '$controllerProvider' || providerName === '$filterProvider' ||
                        providerName === '$compileProvider' || providerName === '$animateProvider') {
                    var providerComponentDeclaration =
                        introspector.getProviderComponentDeclaration(providerName, componentName);

                    angular.forEach(providerComponentDeclaration.injectedServices, function(injectedService) {
                        if (injector.has(injectedService)) {
                            asIsServices[injectedService] = injector.get(injectedService);
                        }
                    });

                    declarations[componentName] = {
                        providerName: providerName,
                        providerMethod: providerComponentDeclaration.providerMethod,
                        declaration: providerComponentDeclaration.rawDeclaration
                    };
                } else if (providerName === '$provide') {
                    asIsServices[componentName] = injector.get(componentName);
                } else {
                    throw 'Unsupported provider: ' + providerName;
                }
            }

            function handleWithMocksComponentKind(toBeIncludedModuleComponent) {
                var providerName = toBeIncludedModuleComponent.providerName;
                var componentName = toBeIncludedModuleComponent.componentName;

                var providerComponentDeclaration =
                    introspector.getProviderComponentDeclaration(providerName, componentName);

                /** @type {(Array.<(string|Function)>|{$get: Array.<(string|Function)})} */
                var annotatedDeclaration = [];

                angular.forEach(providerComponentDeclaration.injectedServices, function (injectedService) {

                    if (!injector.has(injectedService)) {
                        annotatedDeclaration.push(injectedService);
                    } else {
                        var shouldBeMocked = dependencyShouldBeMocked(toBeIncludedModuleComponent, injectedService);

                        var injectedServiceInstance = injector.get(injectedService);
                        var canBeMocked = mockCreator.canInstanceBeMocked(injectedServiceInstance);

                        if (shouldBeMocked && !canBeMocked &&
                                toBeIncludedModuleComponent.dependenciesUsage === 'for') {
                            throw 'Could not mock the dependency explicitly asked to mock: ' + injectedService;
                        }

                        var toBeMocked = shouldBeMocked && canBeMocked;

                        if (toBeMocked) {
                            mockedServices[injectedService] = injectedServiceInstance;
                        } else {
                            asIsServices[injectedService] = injectedServiceInstance;
                        }

                        annotatedDeclaration.push(injectedService + (toBeMocked ? 'Mock' : ''));
                    }
                });

                annotatedDeclaration.push(providerComponentDeclaration.strippedDeclaration);

                if (providerName === '$provide' && providerComponentDeclaration.providerMethod === 'provider') {
                    annotatedDeclaration = {$get: annotatedDeclaration};
                }

                declarations[componentName] = {
                    providerName: providerName,
                    providerMethod: providerComponentDeclaration.providerMethod,
                    declaration: annotatedDeclaration
                };
            }

            function dependencyShouldBeMocked(toBeIncludedModuleComponent, dependencyName) {
                var dependenciesUsage = toBeIncludedModuleComponent.dependenciesUsage;

                if (dependenciesUsage === 'for') {
                    return toBeIncludedModuleComponent.dependencies.indexOf(dependencyName) !== -1;
                } else if (dependenciesUsage === 'except') {
                    return toBeIncludedModuleComponent.dependencies.indexOf(dependencyName) === -1;
                } else if (!dependenciesUsage) {
                    return true;
                } else {
                    throw 'Invalid dependencies usage: ' + dependenciesUsage;
                }
            }

            function configureProviders(callback) {
                return function ($provide, $filterProvider, $controllerProvider, $compileProvider,
                        $animateProvider) {
                    var providers = {
                        $provide: $provide,
                        $filterProvider: $filterProvider,
                        $controllerProvider: $controllerProvider,
                        $compileProvider: $compileProvider,
                        $animateProvider: $animateProvider
                    };

                    callback(providers);
                };
            }


            var buildModuleName = 'generatedByNgImprovedTesting#' + numberOfBuildModules;

            /** @type Object.<Object> */
            var mockedServices = {};

            /** @type Object.<Object> */
            var asIsServices = {};

            /**
             * @type {Object.<{providerName: string, providerMethod: string, declaration: Array.<(string|Function)>}>}
             */
            var declarations = {};

            var moduleRequires = originalModule.requires.slice(0);
            moduleRequires.push('ngImprovedTesting');

            var buildModule = angular.module(buildModuleName, moduleRequires);

            angular.forEach(toBeIncludedModuleComponents, function(toBeIncludedModuleComponent) {
                if (toBeIncludedModuleComponent.componentKind === 'asIs') {
                    handleAsIsComponentKind(toBeIncludedModuleComponent);
                } else if (toBeIncludedModuleComponent.componentKind === 'withMocks') {
                    handleWithMocksComponentKind(toBeIncludedModuleComponent);
                }
            });

            numberOfBuildModules += 1;

            return angular.mock.module(configureProviders(function(providers) {
                angular.forEach(mockedServices, function(originalService, serviceName) {
                    var mockedService = mockCreator.mockInstance(originalService);
                    providers.$provide.value(serviceName + 'Mock', mockedService);
                });

                angular.forEach(asIsServices, function(originalService, serviceName) {
                    providers.$provide.value(serviceName, originalService);
                });

                angular.forEach(declarations, function(declarationInfo, declarationName) {
                    providers[declarationInfo.providerName][declarationInfo.providerMethod](
                        declarationName, declarationInfo.declaration);
                });
            }), buildModule.name);
        };

    }

    /**
     * @ngdoc service
     * @name moduleBuilder
     */
    return {
        /**
         * @name moduleBuilder#forModule
         * @param {string} moduleName
         * @returns {moduleIntrospectorFactory.ModuleBuilder}
         */
        forModule: function(moduleName) {
            return new ModuleBuilder(moduleName);
        }
    };

}
moduleIntrospectorFactory.$inject = ["moduleIntrospector", "mockCreator"];


angular.module('ngImprovedTesting.internal.moduleBuilder', [
        'ngModuleIntrospector',
        'ngImprovedTesting.internal.mockCreator'
     ])
    .factory('moduleBuilder', moduleIntrospectorFactory);

var ngModuleIntrospectorInjector = angular.injector(['ng', 'ngModuleIntrospector']);
var moduleIntrospectorFactory = ngModuleIntrospectorInjector.get('moduleIntrospector');
var moduleIntrospector = moduleIntrospectorFactory('ng');

var original$QProviderConstructor = moduleIntrospector.getProviderDeclaration('$qProvider').rawDeclaration;
var ngInjector = angular.injector(['ng']);
var original$QProviderInstance = ngInjector.instantiate(original$QProviderConstructor, {});


angular.module('ngImprovedTesting.$q', ['ngImprovedTesting.internal.config'])

    /**
     * @ngdoc service
     * @name $q
     * @module ngImprovedTesting
     * @description
     * TODO: add description
     */
    .provider('$q', ["ngImprovedTestingConfigFlags", function(ngImprovedTestingConfigFlags) {
        this.$get = ["$rootScope", "$exceptionHandler", function($rootScope, $exceptionHandler) {
            /** @type {?Array.<function()>} */
            var executeOnNextTick = null;

            if (ngImprovedTestingConfigFlags.$qTick) {
                executeOnNextTick = [];

                $rootScope = {
                    $evalAsync: function (callback) {
                        executeOnNextTick.push(callback);
                    }
                };
            }

            var result = original$QProviderInstance.$get[original$QProviderInstance.$get.length - 1](
                    $rootScope, $exceptionHandler);

            if (ngImprovedTestingConfigFlags.$qTick) {
                /**
                 * @ngdoc method
                 * @name $q#tick
                 * @description
                 * TODO: add description
                 */
                result.tick = function () {
                    angular.forEach(executeOnNextTick, function (callback) {
                        callback();
                    });
                    executeOnNextTick.length = 0;
                };
            }

            return result;
        }];
    }]);

var injector = angular.injector([
        'ng',
        'ngImprovedTesting.internal.config',
        'ngImprovedTesting.internal.mockCreator',
        'ngImprovedTesting.internal.moduleBuilder'
    ]);


var mockCreator = injector.get('mockCreator');

window.ngImprovedTesting = {
    mockInstance: mockCreator.mockInstance,
    config: injector.get('ngImprovedTestingConfig')
};

window.mockInstance = window.ngImprovedTesting.mockInstance;

window.ModuleBuilder = injector.get('moduleBuilder');

}());