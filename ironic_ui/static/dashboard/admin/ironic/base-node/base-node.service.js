/*
 * Copyright 2016 Cray Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
(function() {
  'use strict';

  angular
    .module('horizon.dashboard.admin.ironic')
    .factory('horizon.dashboard.admin.ironic.base-node.service',
             baseNodeService);

  baseNodeService.$inject = [];

  function baseNodeService() {
    var service = {
      PostfixExpr: PostfixExpr,
      driverPropertyGroupHasRequired: driverPropertyGroupHasRequired,
      driverPropertyGroupsToString: driverPropertyGroupsToString,
      compareDriverPropertyGroups: compareDriverPropertyGroups
    };

    /**
     * PostFixExpr is a class primarily developed to support the
     * evaluation of boolean expressions that determine whether a
     * particular property is active.
     *
     * The expression is stored as a postfix sequence of operands and
     * operators. Operands are currently limited to the literal values
     * and the values of properties in a specified set. Currently
     * supported operands are ==, or, and.
     *
     * @return {void}
     */
    function PostfixExpr() {
      this.elem = [];
    }

    PostfixExpr.op = {
      EQ: "==",
      AND: "and",
      OR: "or"
    };

    PostfixExpr.UNDEFINED = undefined;

    PostfixExpr.status = {
      OK: 0,
      ERROR: 1,
      BAD_ARG: 2,
      UNKNOWN_OP: 3,
      MALFORMED: 4
    };

    /**
     * @description Add a property to the expression
     *
     * @param {string} propertyName - Property name
     *
     * @return {void}
     */
    PostfixExpr.prototype.addProperty = function(propertyName) {
      this.elem.push({name: propertyName});
    };

    /**
     * @description Add a value to the expression
     *
     * @param {object} value - value
     *
     * @return {void}
     */
    PostfixExpr.prototype.addValue = function(value) {
      this.elem.push({value: value});
    };

    /**
     * @description Add an operator to the expression
     *
     * @param {PostfixExpr.op} opId - operator
     *
     * @return {void}
     */
    PostfixExpr.prototype.addOperator = function(opId) {
      this.elem.push({op: opId});
    };

    /**
     * @description Get a list of property names referenced by this
     * expression
     *
     * @return {object} An object each property of which corresponds to
     * a property in the expression
     */
    PostfixExpr.prototype.getProperties = function() {
      var properties = {};
      angular.forEach(this.elem, function(elem) {
        if (angular.isDefined(elem.name)) {
          properties[elem.name] = true;
        }
      });
      return properties;
    };

    /**
     * @description Evaluate a boolean binary operation
     *
     * @param {array} valStack - Stack of values to operate on
     * @param {string} opId - operator id
     *
     * @return {integer} Return code
     */
    function _evaluateBoolBinaryOp(valStack, opId) {
      var retCode = PostfixExpr.status.OK;
      var val1 = valStack.pop();
      var val2 = valStack.pop();
      if (typeof val1 === "boolean" &&
          typeof val2 === "boolean") {
        switch (opId) {
          case PostfixExpr.op.AND:
            valStack.push(val1 && val2);
            break;
          case PostfixExpr.op.OR:
            valStack.push(val1 || val2);
            break;
          default:
            retCode = PostfixExpr.status.UNKNOWN_OP;
        }
      } else {
        retCode = PostfixExpr.status.BAD_ARG;
      }
      return retCode;
    }

    /**
     * @description Evaluate the experssion using property values from
     * a specified set
     *
     * @param {object} propertySet - Dictionary of DriverProperty instances
     *
     * @return {array} Return code and Value of the expression
     */
    PostfixExpr.prototype.evaluate = function(propertySet) {
      var resultStack = [];
      for (var i = 0, len = this.elem.length; i < len; i++) {
        var elem = this.elem[i];
        if (elem.hasOwnProperty("name")) {
          resultStack.push(propertySet[elem.name].getInputValue());
        } else if (elem.hasOwnProperty("value")) {
          resultStack.push(elem.value);
        } else if (elem.hasOwnProperty("op")) {
          if (elem.op === PostfixExpr.op.EQ) {
            var val1 = resultStack.pop();
            var val2 = resultStack.pop();
            resultStack.push(val1 === val2);
          } else {
            var ret = _evaluateBoolBinaryOp(resultStack, elem.op);
            if (ret !== PostfixExpr.status.OK) {
              return [ret, PostfixExpr.UNDEFINED];
            }
          }
        } else {
          return [PostfixExpr.status.UNKNOWN_ELEMENT, PostfixExpr.UNDEFINED];
        }
      }
      return resultStack.length === 1
        ? [PostfixExpr.status.OK, resultStack.pop()]
        : [PostfixExpr.status.MALFORMED, PostfixExpr.UNDEFINED];
    };

    /**
     * @description Check whether a group contains required properties
     *
     * @param {DriverProperty[]} group - Property group
     * @return {boolean} Return true if the group contains required
     *   properties, false otherwise
     */
    function driverPropertyGroupHasRequired(group) {
      var hasRequired = false;
      for (var i = 0; i < group.length; i++) {
        if (group[i].required) {
          hasRequired = true;
          break;
        }
      }
      return hasRequired;
    }

    /**
     * @description Convert array of driver property groups to a string
     *
     * @param {array[]} groups - Array of driver property groups
     * @return {string} Output string
     */
    function driverPropertyGroupsToString(groups) {
      var output = [];
      angular.forEach(groups, function(group) {
        var groupStr = [];
        angular.forEach(group, function(property) {
          groupStr.push(property.name);
        });
        groupStr = groupStr.join(", ");
        output.push(['[', groupStr, ']'].join(""));
      });
      output = output.join(", ");
      return ['[', output, ']'].join("");
    }

    /**
     * @description Comaprison function used to sort driver property groups
     *
     * @param {DriverProperty[]} group1 - First group
     * @param {DriverProperty[]} group2 - Second group
     * @return {integer} Return:
     * < 0 if group1 should precede group2 in an ascending ordering
     * > 0 if group2 should precede group1
     * 0 if group1 and group2 are considered equal from ordering perpsective
     */
    function compareDriverPropertyGroups(group1, group2) {
      var group1HasRequired = driverPropertyGroupHasRequired(group1);
      var group2HasRequired = driverPropertyGroupHasRequired(group2);

      if (group1HasRequired === group2HasRequired) {
        if (group1.length === group2.length) {
          return group1[0].name.localeCompare(group2[0].name);
        } else {
          return group1.length - group2.length;
        }
      } else {
        return group1HasRequired ? -1 : 1;
      }
      return 0;
    }

    return service;
  }
})();
