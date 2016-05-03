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
var moment = require( 'moment' );
var isElevated = require( 'is-elevated' );

var screen = blessed.screen({
    smartCSR: true
});

// Path to Airport binary on 10.7, 10.8, and 10.9 (might be different on older OS X)
var PATH_TO_AIRPORT = '/System/Library/PrivateFrameworks/Apple80211.framework/Resources/airport';

// Regex to validate a MAC address
// Example: 00-00-00-00-00-00 or 00:00:00:00:00:00 or 000000000000
var MAC_ADDRESS_RE = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i

var device = 'en0';
var network;
var debug = false;

if( process.platform === 'win32' ){
    device = 'Wireless Network Connection';
}

// Get vars for widgets
var grid,
    gauge,
    log,
    list,
    message,
    debugLog;

if( process.argv.indexOf( '--debug' ) > -1 ){
    debug = true;
}

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
    throw chalk.red( 'Error: ' + error.message );
}

/**
* Add a line to the Action log
* @param {string} line
*/
function addLogLine( line ){
    line = '[' + moment().format( 'HH:mm' ) + '] ' + line;
    log.log( line );
    screen.render();
}

/**
* Load quota usage from the network provider
*/
function loadQuota(){
    network.shouldRefresh( function( error, response ){
        if( error ){
            throwError( error );

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
 * Checks if the given value is a mac adress
 * @param {string} mac
*/
function isMac( mac ){
    return MAC_ADDRESS_RE.test( mac.toUpperCase() );
}

/**
 * Get the currently avaialble networks
*/
function getAvailableNetworks( device ){
    var output,
        networks,
        networkNames;

    if( process.platform === 'win32' ){
        output = shell.exec( 'netsh wlan show network', { silent: true } ).output;
        networks = output.split( '\n' );
        networkNames = [];

        for( var x = 0; x < networks.length; x = x + 1 ){
            var ssidMatch = /SSID\s\d+\s\:\s(.*)/gim.exec( networks[ x ] );
            if( ssidMatch && ssidMatch[ 1 ] ){
                networkNames.push( ssidMatch[ 1 ].trim() );
            }
        }
    } else {
        output = shell.exec( PATH_TO_AIRPORT + ' -s', { silent: true } ).output;
        networks = output.split( '\n' );
        networkNames = [];

        networks.pop();
        networks.shift();

        for( var i = 0; i < networks.length; i = i + 1 ){
            var parts = networks[ i ].split( ' ' ),
            networkName = '';

            for( var x = 0; x < parts.length; x = x + 1 ){
                if( parts[ x ].length <= 0 ){
                    continue;
                }

                // We've reached the BSSID part of the network
                if( isMac( parts[ x ] ) ){
                    break;
                }

                networkName = networkName + parts[ x ] + ' ';
            }

            networkNames.push( networkName.trim() );
        }
    }

    return networkNames;
}

/**
* Get SSID of the current network for the requested device
* @param {string} device
*/
function getCurrentNetworkName( device ){
    if( process.platform === 'win32' ){
        var output = shell.exec( 'netsh wlan show interface', { silent: true } ).output;
        var parts = output.split( '\n' );

        for( var x = 0; x < parts.length; x = x + 1 ){
            var matches = /SSID\s*\:(.*)/gim.exec( parts[ x ] );
            if( matches && matches[ 1 ] ){
                return matches[ 1 ].trim();
            }
        }

        return false;
    } else {
        return shell.exec( 'networksetup -getairportnetwork ' + device + ' | cut -c 24-', { silent: true } ).output.trim();
    }
}

/**
* Get a list of available profiles
*/
function getWindowsProfiles(){
    var output;
    var lines;
    var profiles = [];

    if( process.platform !== 'win32' ){
        return false;
    }

    output = shell.exec( 'netsh wlan show profiles', { silent: true } ).output;
    lines = output.split( '\n' );

    for( var i = 0; i < lines.length; i = i + 1 ){
        var matches = /All\sUser\sProfile\s*\:(.*)/gim.exec( lines[ i ] );

        if( matches && matches[ 1 ] ){
            profiles.push( matches[ 1 ].trim() );
        }
    }

    return profiles;
}

/**
* Connect the specified device to the selected network
* @param {string} device
*/
function connectToNetwork( device ){
    if( process.platform === 'win32' ){
        var profiles = getWindowsProfiles();
        var gotProfile = false;

        for( var i = 0; i < profiles.length; i = i + 1 ){
            if( profiles[ i ] === network.ssid ){
                gotProfile = true;
                break;
            }
        }

        if( !gotProfile ){
            throwError( new Error( 'Couldn\'t find profile for "' + network.ssid + '". Please connect to it once with auto-connect to create a profile.' ) );
        }

        shell.exec( 'netsh wlan connect name="' + network.ssid + '"', { silent: true } );
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

function initGauge(){
    gauge = grid.set( 0, 0, 2, 12, contrib.gauge, {
        label: 'MB Used',
        stroke: 'green',
        fill: 'white'
    });

    screen.append( gauge );
    screen.render();
}

function initLog(){
    log = grid.set( 2, 0, 10, 12, contrib.log, {
        fg: 'green',
        selectedFg: 'green',
        label: 'Action log'
    });

    screen.append( log );
    screen.render();
}

function getCompatibleNetworks(){
    var availableNetworks = getAvailableNetworks( device ),
        compatibleNetworks = require( './modules/index.js' ),
        networks = {};

    for( var i = 0; i < availableNetworks.length; i = i + 1 ){
        if( typeof compatibleNetworks[ availableNetworks[ i ] ] !== 'undefined' ){
            networks[ availableNetworks[ i ] ] = compatibleNetworks[ availableNetworks[ i ] ];
        }
    }

    return networks;
}

function displayErrorBox( content ){
    message = blessed.box({
        parent: screen,
        top: 'center',
        left: 'center',
        width: 'shrink',
        height: 'shrink',
        padding: {
            top: 2,
            right: 10,
            bottom: 2,
            left: 10
        },
        content: content,
        align: 'center',
        valign: 'middle',
        border: {
            type: 'line'
        }
    });

    message.on( 'keypress', function(){
        process.exit( 0 );
    });

    screen.render();
}

function initGrid(){
    grid = new contrib.grid({
        rows: 12,
        cols: 12,
        screen: screen
    });
}

function initNetworkList(){
    var networks = getCompatibleNetworks(),
        networkNames = Object.keys( networks );

    if( networkNames.length <= 0 ){
        displayErrorBox( 'No compatible networks in range' );

        return false;
    }

    initGrid();

    if( debug ){
        initDebugWindow();
    }

    list = grid.set( 2, 4, 6, 4, blessed.list, {
        label: 'Available networks',
        keys: true,
        style: {
            selected: {
                bg: 'blue'
            }
        },
        items: networkNames
    });

    list.on( 'select', function( ch, key ) {
        initNetwork( networks[ ch.content ] );
        screen.remove( list );
    });

    screen.append( list );
    screen.render();

    list.focus();
}

function addDebugMessage( message ){
    if( Array.isArray( message ) ){
        for( var i = 0; i < message.length; i = i + 1 ){
            debugLog.addItem( message[ i ] );
        }
    } else {
        debugLog.addItem( message );
    }

    screen.render();
}

function initDebugWindow(){
    debugLog = grid.set( 8, 0, 4, 12, blessed.list, {
        label: 'Debug'
    });

    screen.append( debugLog );
    screen.render();
}

function initNetwork( ssid ){
    try {
        network = require( './modules/' + ssid + '.js' );
    } catch( error ){
        throwError( new Error( 'Unable to find module "' + ssid + '" in ./modules/' ) );
    }

    if( network.requiresPassword ){
        if( !argv.password ){
            throwError( new Error( 'This network requires a password.' ) );
        }

        network.password = argv.password;
    }

    initGauge();
    initLog();

    addLogLine( 'Module ' + ssid + ' loaded' );

    // If not already connected, connect to the network
    if( getCurrentNetworkName( device ) !== network.ssid ){
        connectToNetwork( device );
        addLogLine( 'Connected to network ' + network.ssid );

        if( getCurrentNetworkName( device ) !== network.ssid ){
            throwError( new Error( 'Unable to connect to network "' + network.ssid + '". Are you sure it\'s available?' ) );
        }
    }

    loadQuota();

    // Refresh quota every 10 seconds
    setInterval( loadQuota, 10000 );
}

/**
* Start the application
*/
function start(){
    isElevated( function ( error, elevated ) {
        if( error ){
            throwError( error );
        }

    	if( !elevated ){
            throwError( new Error( 'Must run as admin (or using sudo) to change network settings' ) );
        }

        screen.key( [ 'escape', 'q', 'C-c' ], function( ch, key ){
            return process.exit( 0 );
        });

        screen.title = 'Wifi Unlimiter';

        initNetworkList();
    });
}

module.exports = addLogLine;

start();
