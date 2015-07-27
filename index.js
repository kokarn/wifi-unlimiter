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
    network;

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

function addLogLine( line ){
    log.log( line );
}

function loadQuota(){
    network.shouldRefresh( function( doRefresh, percentUsed ){
        if( doRefresh ){
            addLogLine( 'Limit reached, refreshing mac' );
            refreshMac( device );
        }

        gauge.setPercent( percentUsed );
        screen.render();
    });
}

function getCurrentNetworkName( device ){
    if( process.platform === 'win32' ){
        // Probably something like this, need a windows machine to test on
        //shell.exec( 'netsh wlan show all', { silent: true } ).output.trim();

        return false;
    } else {
        return shell.exec( 'networksetup -getairportnetwork ' + device + ' | cut -c 24-', { silent: true } ).output.trim();
    }
}

function connectToNetwork( device ){
    if( process.platform === 'win32' ){
        shell.exec( 'netsh wlan connect name=' + shellescape( network.ssid ), { silent: true } );
    } else {
        if( network.password ){
            shell.exec( 'networksetup -setairportnetwork ' + device + ' ' + shellescape( network.ssid ) + ' ' + network.password, { silent: true } );
        } else {
            shell.exec( 'networksetup -setairportnetwork ' + device + ' ' + shellescape( network.ssid ), { silent: true } );
        }
    }
}

function refreshMac( device ){
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

    connectToNetwork( device );

    addLogLine( 'New mac is ' + mac );
}

function start(){
    if( process.platform !== 'win32' && process.getuid() !== 0 ){
        throwError( new Error( 'Must run as root (or using sudo) to change network settings' ) );
    }

    screen.key( [ 'escape', 'q', 'C-c' ], function( ch, key ){
        return process.exit( 0 );
    });

    screen.title = 'Wifi Unlimiter';

    screen.append( gauge );
    screen.append( log );

    try {
        network = require( './modules/' + argv.network + '.js' );
    } catch( error ){
        throwError( new Error( 'Unable to find module "' + argv.network + '" in ./modules/' ) );
    }

    if( network.requiresPassword ){
        if( !argv.password ){
            throwError( new Error( 'This network requires a password. Please pass it with the --password parameter' ) );
        }

        network.password = argv.password;
    }

    // If not already connected, connect to the network
    if( getCurrentNetworkName( device ) !== network.ssid ){
        connectToNetwork( device );
    }

    addLogLine( 'Module ' + argv.network + ' loaded' );
    screen.render();

    if( getCurrentNetworkName( device ) !== network.ssid ){
        throwError( new Error( 'Unable to connect to network "' + network.ssid + '". Are you sure it\'s available?' ) );
    }

    loadQuota();

    // Refresh quota every 10 seconds
    setInterval( loadQuota, 10000 );
}

module.exports = {
    log: addLogLine,
    throwError: throwError
};

start();
