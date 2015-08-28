'use strict';

var networks = {};

networks[ require( './SJ.js' ).ssid ] = 'SJ';
networks[ require( './Test.js' ).ssid ] = 'Test';

module.exports = networks;
