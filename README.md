# wifi-unlimiter

This simple package is a way to keep from being limited on networks by switching the mac address when nearing the allocated transfer limit.

Right now the only supported network is the Swedish Railway network "SJ" but it should be pretty simple to add additional modules for other networks.

[![Dependency Status](https://david-dm.org/kokarn/wifi-unlimiter.svg?theme=shields.io&style=flat)](https://david-dm.org/kokarn/wifi-unlimiter)

## Install
```shell
git clone https://github.com/kokarn/wifi-unlimiter.git
cd wifi-unlimiter
npm install
```

## Usage
```shell
sudo node index.js --network=$NETWORK
```
where $NETWORK is the name of the limited network. duh.


#### Examples

```shell
sudo node index.js --network=SJ
```

If the network requires a password, pass that along with ```--password```

```shell
sudo node index.js --network=SJ --password=myPassword
```

# Disclaimer
This might break the terms of use for a specific network. I take no responsibility for what you do with this. If you'r uncertain if it's allowed, don't use it.
