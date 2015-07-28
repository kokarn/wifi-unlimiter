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

/**
* Set MAC address for the specified device interface
* @param {string} device
* @param {string} mac
* @param {string} port
*/
function setMACAddress( device, mac, port ) {
    try {
        spoof.setInterfaceMAC( device, mac, port );
    } catch( error ){
        throwError( error );
    }
}

/**
* Print error and terminate the program
* @param {Error} error
*/
function throwError( error ) {
    console.error( chalk.red( 'Error:', error.message ) );
    process.exit( -1 )
}

/**
* Add a line to the Action log
* @param {string} line
*/
function addLogLine( line ){
    log.log( line );
    screen.render();
}

/**
* Load quota usage from the network provider
*/
function loadQuota(){
    network.shouldRefresh( function( error, response ){
        if( error ){
            // Temporary workaround until I figure out how to throw errors
            // when we have a screen
            addLogLine( error.message );

            setTimeout( function(){
                throwError( error );
            }, 5000 );

            return false;
        }

        if( response.doRefresh ){
            addLogLine( 'Limit reached, refreshing mac' );
            refreshMac( device );
        }

        gauge.setPercent( response.percentUsed );
        screen.render();
    });
}

/**
* Get SSID of the current network for the requested device
* @param {string} device
*/
function getCurrentNetworkName( device ){
    if( process.platform === 'win32' ){
        // Probably something like this, need a windows machine to test on
        //shell.exec( 'netsh wlan show all', { silent: true } ).output.trim();

        return false;
    } else {
        return shell.exec( 'networksetup -getairportnetwork ' + device + ' | cut -c 24-', { silent: true } ).output.trim();
    }
}

/**
* Connect the specified device to the selected network
* @param {string} device
*/
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

/**
* Refresh MAC address for the specified device
* @param {string} device
*/
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

/**
* Start the application
*/
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

    addLogLine( 'Module ' + argv.network + ' loaded' );

    // If not already connected, connect to the network
    if( getCurrentNetworkName( device ) !== network.ssid ){
        connectToNetwork( device );
        addLogLine( 'Connected to network ' + network.ssid );
    }

    if( getCurrentNetworkName( device ) !== network.ssid ){
        throwError( new Error( 'Unable to connect to network "' + network.ssid + '". Are you sure it\'s available?' ) );
    }

    loadQuota();

    // Refresh quota every 10 seconds
    setInterval( loadQuota, 10000 );
}

module.exports = {
    log: addLogLine
};

start();
