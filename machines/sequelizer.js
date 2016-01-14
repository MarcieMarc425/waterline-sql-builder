module.exports = {


  friendlyName: 'Sequelizer',


  description: 'Uses Knex to generate sequel for the tree',


  cacheable: true,


  sync: true,


  inputs: {

    dialect: {
      description: 'The SQL dialect to use when generating the query',
      example: 'postgresql',
      defaultsTo: 'postgresql'
    },

    tree: {
      description: 'A tokenized tree representing the query values.',
      example: [[]],
      required: true
    }

  },


  exits: {

    success: {
      variableName: 'result',
      description: 'A SQL string generated from the tree.',
      example: 'select * from "books"'
    },

  },


  fn: function(inputs, exits) {

    var _ = require('lodash');
    var knex = require('knex')({ dialect: inputs.dialect });
    var tree = inputs.tree;
    var query = knex.queryBuilder();


    //  ╦ ╦╦ ╦╔═╗╦═╗╔═╗  ╔═╗═╗ ╦╔═╗╦═╗╔═╗╔═╗╔═╗╦╔═╗╔╗╔  ╔╗ ╦ ╦╦╦  ╔╦╗╔═╗╦═╗
    //  ║║║╠═╣║╣ ╠╦╝║╣   ║╣ ╔╩╦╝╠═╝╠╦╝║╣ ╚═╗╚═╗║║ ║║║║  ╠╩╗║ ║║║   ║║║╣ ╠╦╝
    //  ╚╩╝╩ ╩╚═╝╩╚═╚═╝  ╚═╝╩ ╚═╩  ╩╚═╚═╝╚═╝╚═╝╩╚═╝╝╚╝  ╚═╝╚═╝╩╩═╝═╩╝╚═╝╩╚═
    //
    // Builds up an array of values that can be passed into the .where or .orWhere
    // functions of Knex.
    function whereBuilder(expr, expression) {

      // Handle KEY/VALUE pairs
      if(expr.type === 'KEY') {
        // Reset the expression for each new key
        expression = [];
        expression.push(expr.value);
        return expression;
      }

      // Handle OPERATORS such as '>' and '<'
      if(expr.type === 'OPERATOR') {

        // Clear the second and third items in the array to remove any
        // previous expression values for the key
        _.pullAt(expression, 1);
        _.pullAt(expression, 2);

        // Set the second item in the array to the operator
        expression[1] = expr.value;

        return expression;
      }

      // Set the second or third item in the array to the value
      if(expr.type === 'VALUE') {
        expression.push(expr.value);
        return expression;
      }

    }


    //  ╔═╗╦═╗╔═╗╔═╗╔═╗╔═╗╔═╗  ╔═╗╔═╗╔╗╔╔╦╗╦╔╦╗╦╔═╗╔╗╔╔═╗╦
    //  ╠═╝╠╦╝║ ║║  ║╣ ╚═╗╚═╗  ║  ║ ║║║║ ║║║ ║ ║║ ║║║║╠═╣║
    //  ╩  ╩╚═╚═╝╚═╝╚═╝╚═╝╚═╝  ╚═╝╚═╝╝╚╝═╩╝╩ ╩ ╩╚═╝╝╚╝╩ ╩╩═╝
    //
    // Process a group of values that make up a conditional.
    // Such as an OR statement.
    function processGroup(tokens, nested, expression) {

      // Hold values that make up a nested expression group.
      var expressionGroup = [];

      // Loop through each expression in the group
      _.each(tokens, function(groupedExpr, idx) {

        // If the grouped expression is a nested array, this represents a nested
        // OR statement. So instead of building the query outright, we want to
        // collect all the pieces that make it up and call the Knex grouping
        // function at the end.
        if(_.isArray(groupedExpr)) {
          expressionGroup.push(processGroup(groupedExpr, true, expression));
          return;
        }

        if(groupedExpr.type === 'KEY' || groupedExpr.type === 'OPERATOR' || groupedExpr.type === 'VALUE') {
          expression = whereBuilder(groupedExpr, expression);
        }

        // If the expression's type is value, after we process it we can add
        // it to the query. Unless we are in a nested statement in which case
        // just add it to the expression group.
        if(groupedExpr.type === 'VALUE') {
          if(nested) {
            expressionGroup = expressionGroup.concat(expression);
          } else {
            query.orWhere.apply(query, expression);
          }
        }
      });

      if(nested) {
        return expressionGroup;
      }

      // If there is an expression group and no nesting, create a grouped function
      // on the query.
      query.orWhere.call(query, function() {
        var self = this;
        _.each(expressionGroup, function(expr) {
          self.orWhere.apply(self, expr);
        });
      });
    }

    //  ╦╔╗╔╔═╗╔═╗╦═╗╔╦╗  ╔╗ ╦ ╦╦╦  ╔╦╗╔═╗╦═╗
    //  ║║║║╚═╗║╣ ╠╦╝ ║   ╠╩╗║ ║║║   ║║║╣ ╠╦╝
    //  ╩╝╚╝╚═╝╚═╝╩╚═ ╩   ╚═╝╚═╝╩╩═╝═╩╝╚═╝╩╚═
    //
    // Builds an array of KEY/VALUE pairs to use as the insert clause.
    function insertBuilder(expr, expression) {
      var obj = {};

      // Handle KEY/VALUE pairs
      if(expr.type === 'KEY') {
        obj[expr.value] = undefined;
        expression.push(obj);

        return expression;
      }

      // Set the VALUE pair
      if(expr.type === 'VALUE') {
        obj = _.last(expression);
        var key = _.first(_.keys(obj));
        obj[key] = expr.value;

        return expression;
      }

    }


    //  ████████╗ ██████╗ ██╗  ██╗███████╗███╗   ██╗    ██████╗  █████╗ ██████╗ ███████╗███████╗██████╗
    //  ╚══██╔══╝██╔═══██╗██║ ██╔╝██╔════╝████╗  ██║    ██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔════╝██╔══██╗
    //     ██║   ██║   ██║█████╔╝ █████╗  ██╔██╗ ██║    ██████╔╝███████║██████╔╝███████╗█████╗  ██████╔╝
    //     ██║   ██║   ██║██╔═██╗ ██╔══╝  ██║╚██╗██║    ██╔═══╝ ██╔══██║██╔══██╗╚════██║██╔══╝  ██╔══██╗
    //     ██║   ╚██████╔╝██║  ██╗███████╗██║ ╚████║    ██║     ██║  ██║██║  ██║███████║███████╗██║  ██║
    //     ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝    ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝
    //
    // Loop through each token group in the tree and add to the query
    _.forEach(tree, function(tokenGroup, key) {
      var identifier;
      var expression = [];

      // Loop through each item in the group and build up the expression
      _.each(tokenGroup, function(expr) {

        // Handle identifiers by storing them on the fn
        if(expr.type === 'IDENTIFIER') {
          identifier = expr.value;
          return;
        }

        // Handle sets of values being inserted
        if(identifier === 'INSERT' && (expr.type === 'KEY' || expr.type === 'VALUE')) {
          expression = insertBuilder(expr, expression);
        }

        // Handle clauses in the WHERE value
        if(identifier === 'WHERE' && (expr.type === 'KEY' || expr.type === 'OPERATOR' || expr.type === 'VALUE')) {
          expression = whereBuilder(expr, expression);
        }

        // Process value and use the appropriate Knex function
        if(expr.type === 'VALUE') {

          // Examine the identifier value
          switch(identifier) {
            case 'SELECT':
              query.select(expr.value);
              break;

            case 'FROM':
              query.from(expr.value);
              break;

            case 'SCHEMA':
              query.withSchema(expr.value);
              break;

            case 'DISTINCT':
              query.distinct(expr.value);
              break;

            case 'INTO':
              query.into(expr.value);
              break;

            case 'INSERT':
              query.insert(expression);
              break;

            case 'WHERE':
              // Set the second or third item in the array to the value
              query.where.apply(query, expression);
              break;
          }

          return;
        }


        //  ╔═╗╦═╗╔═╗╦ ╦╔═╗╦╔╗╔╔═╗
        //  ║ ╦╠╦╝║ ║║ ║╠═╝║║║║║ ╦
        //  ╚═╝╩╚═╚═╝╚═╝╩  ╩╝╚╝╚═╝
        //
        // If the expression is an array then the values should be grouped.
        if(_.isArray(expr)) {
          processGroup(expr, false, expression);
        }

      });

    });

    var _SQL = query.toString();
    return exits.success(_SQL);
  },



};
