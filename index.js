'use strict';

// Heavily reliant on feross great "spoof" lib
// https://github.com/feross/spoof

var shell = require( 'shelljs' );
var spoof = require( 'spoof' );
var chalk = require( 'chalk' );
var pretty = require( 'prettysize' );
var blessed = require( 'blessed' );
var contrib = require( 'blessed-contrib' );
var shellescape = require( 'escapeshellarg' );
var argv = require( 'minimist' )( process.argv.slice( 2 ) );
var screen = blessed.screen();
var gauge = contrib.gauge();
var grid = new contrib.grid({
    rows: 12,
    cols: 12,
    screen: screen
});

//grid.set(row, col, rowSpan, colSpan, obj, opts)
var gauge = grid.set( 0, 0, 2, 12, contrib.gauge, {
    label: 'MB Used',
    stroke: 'green',
    fill: 'white'
});

var log = grid.set( 2, 0, 10, 12, contrib.log, {
    fg: 'green',
    selectedFg: 'green',
    label: 'Action log'
});

var device = 'en0',
    loader;

function setMACAddress( device, mac, port ) {
    try {
        spoof.setInterfaceMAC( device, mac, port );
    } catch( error ){
        throwError( error );
    }
}

/**
* Print error and terminate the program
* @param  {Error} err
*/
function throwError( error ) {
    console.error( chalk.red( 'Error:', error.message ) );
    process.exit( -1 )
}

function loadQuota(){
    loader.shouldRefresh( function( doRefresh, percentUsed ){
        if( doRefresh ){
            log.log( 'Limit reached, refreshing mac' );
            refreshMac( device, loader.network );
        }

        gauge.setPercent( percentUsed );
        screen.render();
    });
}

function refreshMac( device, network ){
    var it,
        mac;

    try {
        it = spoof.findInterface( device );
    } catch( error ){
        throwError( error );
    }

    if( !it ){
        throwError( new Error( 'Could not find device for ' + device ) );
    }

    mac = spoof.random();
    setMACAddress( it.device, mac, it.port );

    // Connect to network again
    if( process.platform === 'win32' ){
        shell.exec( 'netsh wlan connect name=' + shellescape( network ) );
    } else {
        shell.exec( 'networksetup -setairportnetwork ' + device + ' ' + shellescape( network ) );
    }

    log.log( 'New mac is ' + mac );
}

function start(){
    if( process.platform !== 'win32' && process.getuid() !== 0 ){
        throwError( new Error( 'Must run as root (or using sudo) to change network settings' ) );
    }

    screen.key( [ 'escape', 'q', 'C-c' ], function( ch, key ){
        return process.exit( 0 );
    });

    screen.append( gauge );
    screen.append( log );

    try {
        loader = require( './modules/' + argv.network + '.js' );
    } catch( error ){
        throwError( new Error( 'Unable to find module "' + argv.network + '" in ./modules/' ) );
    }

    log.log( 'Module ' + argv.network + ' loaded' );

    loadQuota();

    // Refresh quota every 10 seconds
    setInterval( loadQuota, 10000 );
}

module.exports = {
    log: log.log,
    throwError: throwError
};

start();
