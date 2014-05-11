(function(window) {
'use strict';

var injector = angular.injector(['ng', 'ngImprovedTesting']);

window.ModuleBuilder = injector.get('ModuleBuilder');
}(window));
;/* global ngImprovedTestingModule */
(function() {
'use strict';

/**
 * @ngdoc service
 * @constructor
 */
function MockCreator() {

    /**
     * @param {*} value
     * @returns {boolean}
     */
    this.canBeMocked = function (value) {
        return angular.isFunction(value) || isObjectWithMethods(value);
    };

    /**
     * @param {(Function|Object)} value
     * @returns {(Function|Object)}
     */
    this.createMock = function (value) {
        if (angular.isFunction(value)) {
            return jasmine.createSpy();
        } else if (angular.isObject(value)) {
            return createMockObject(value);
        } else {
            throw 'Could not mock provided value: ' + value;
        }
    };

    function isObjectWithMethods(value) {
        if (!angular.isObject(value)) {
            return false;
        }

        for (var propertyName in value) {
            if (!value.hasOwnProperty(propertyName)) {
                continue;
            }

            var property = value[propertyName];
            if (angular.isFunction(property)) {
                return true;
            }
        }

        return false;
    }

    function createMockObject(obj) {
        var result = {};

        for (var propertyName in obj) {
            if (!obj.hasOwnProperty(propertyName)) {
                continue;
            }

            var property = obj[propertyName];
            if (angular.isFunction(property)) {
                result[propertyName] = jasmine.createSpy();
            } else {
                result[propertyName] = property;
            }
        }

        return result;
    }
}

angular.module('ngImprovedTesting')
    .service('mockCreator', MockCreator);

}());;(function() {
'use strict';

angular.module('ngImprovedTesting', ['ngImprovedModules']);
}());
;/* global ngImprovedTesting,ngImprovedTestingModule */
(function() {
'use strict';

angular.module('ngImprovedTesting').factory('ModuleBuilder', [
        'moduleIntrospector', 'mockCreator',
        function(moduleIntrospector, mockCreator) {

    var numberOfBuildModules = 0;

    /**
     * @ngdoc type
     * @constructor
     */
    function ModuleBuilder(moduleName) {
        var servicesUsingMockedServices = [];

        var originalModule = angular.module(moduleName);
        if (!originalModule) {
            throw 'Could not find angular module: ' + moduleName;
        }

        var injector = angular.injector(['ng', moduleName]);

        //noinspection SpellCheckingInspection
        var introspector = moduleIntrospector(moduleName);

        /**
         * @param serviceName
         * @returns {ModuleBuilder}
         */
        this.withServiceUsingMocks = function(serviceName) {
            var serviceDeclaration = introspector.getServiceDeclaration(serviceName);
            if (!serviceDeclaration) {
                throw 'Could not find declaration of service with name: ' + serviceName;
            }

            if (serviceDeclaration.providerMethod === 'constant' || serviceDeclaration.providerMethod === 'value') {
                throw 'Services declares with "contact" or "value" are not supported';
            }

            servicesUsingMockedServices.push(serviceName);
            return this;
        };

        /**
         * @returns {function()}
         */
        this.build = function() {
            numberOfBuildModules++;
            var buildModuleName = 'generatedByNgImprovedTesting#' + numberOfBuildModules;

            /** @type Array.<string> */
            var toBeMockedServices = [];

            var nonMockServiceDependencies = [];

            var buildModule = angular.module(buildModuleName, originalModule.requires);

            angular.forEach(servicesUsingMockedServices, function (serviceName) {
                var serviceDependencies = introspector.getServiceDependencies(injector, serviceName);

                var annotatedService = [];

                angular.forEach(serviceDependencies, function (serviceDependencyInfo, serviceDependencyName) {
                    var toBeMocked = serviceDependencyInfo.module.name !== 'ng' &&
                        mockCreator.canBeMocked(serviceDependencyInfo.instance);

                    if (toBeMocked) {
                        toBeMockedServices.push(serviceDependencyName);
                    } else {
                        nonMockServiceDependencies.push(serviceDependencyName);
                    }

                    annotatedService.push(serviceDependencyName + (toBeMocked ? 'Mock' : ''));
                });

                var serviceDeclaration = introspector.getServiceDeclaration(serviceName);

                annotatedService.push(serviceDeclaration.declaration);

                buildModule[serviceDeclaration.providerMethod](serviceName, annotatedService);
            });

            return angular.mock.module(function($provide) {
                angular.forEach(toBeMockedServices, function(toBeMockService) {
                    var originalService = injector.get(toBeMockService);

                    var serviceMock = mockCreator.createMock(originalService);
                    $provide.value(toBeMockService + 'Mock', serviceMock);
                });

                angular.forEach(nonMockServiceDependencies, function(nonMockServiceDependency) {
                    $provide.value(nonMockServiceDependency, injector.get(nonMockServiceDependency));
                });
            }, buildModule.name);
        };

    }

    /**
     * @ngdoc service
     * @name ModuleBuilder
     */
    return {
        /**
         * @name ModuleBuilder#forModule
         * @param {string} moduleName
         * @returns {ModuleBuilder}
         */
        forModule: function(moduleName) {
            return new ModuleBuilder(moduleName);
        }
    };

}]);

}());
