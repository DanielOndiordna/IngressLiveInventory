// ==UserScript==
// @author         EisFrei - fork by DanielOnDiordna
// @name           IITC plugin: Live Inventory
// @category       Info
// @version        0.0.16.20210617.001900
// @homepageURL    https://github.com/EisFrei/IngressLiveInventory
// @updateURL      https://softspot.nl/ingress/plugins/iitc-plugin-liveInventory.meta.js
// @downloadURL    https://softspot.nl/ingress/plugins/iitc-plugin-liveInventory.user.js
// @description    [EisFrei-0.0.16.20210617.001900] Show current ingame inventory. Requires CORE subscription (Fork by DanielOnDiordna https://github.com/DanielOndiordna/IngressLiveInventory)
// @id             iitc-plugin-liveInventory@EisFrei
// @namespace      https://softspot.nl/ingress/
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    // ensure plugin framework is there, even if iitc is not yet loaded
    if(typeof window.plugin !== 'function') window.plugin = function() {};

    // use own namespace for plugin
    window.plugin.LiveInventory = function() {};
    var self = window.plugin.LiveInventory;
    self.id = 'LiveInventory';
    self.title = 'Live Inventory';
    self.version = '0.0.16.20210617.001900';
    self.author = 'EisFrei - fork by DanielOnDiordna';
    self.changelog = `
Changelog:

version 0.0.12.20210313.211400
- fork from github version 0.0.12
- replaced tab indent with 4 spaces
- fixed plugin script formatting to make it work on IITC.me 0.26
- replace variable thisPlugin by self
- split menu into 3 submenus
- autosave and apply settings changes
- changed colomn order, count first
- added inventory refresh button
- added alerts and console messages when refreshing inventory with a nice time string
- renew menu when refreshing inventory
- added portals list plugin column with key count

version 0.0.12.20210415.160000
- IITC me compatibility fix for getMapZoomTileParameters

version 0.0.12.20210421.190200
- minor fix for IITC CE where runHooks iitcLoaded is executed before addHook is defined in this plugin

version 0.0.12.20210524233900
- added runhooks pluginLiveInventoryUpdated to return an object of itemCount, keykeyCount and keyMap objects
- added runhooks pluginLiveInventorySubscription to return subscription data
- added the display of items/keys count inside every capsule, in table and in portal details
- added a capsules tab with overview of items/keys counts
- scrollable list with fixed header/buttons at the top (TO DO: needs a fix for table header alignment > DONE 0.0.15.20210613.235900)
- added refresh anyway button, to override the 10min interval

version 0.0.13.20210528210100
- changed icon text color to bright yellow (instead of soft yellow)
- changed icon text size to 11px (instead of 10px)
- added icon display settings option to display count of keys outside capsules and keys in capsules (between brackets)

version 0.0.14.20210607.004200
- update portal counts on portals after inventory refresh
- rearranged and changed ajax queries with better callback handling

version 0.0.15.20210613.235900
- fixed table header alignment
- added setting to show detailed keys in capsules for selected portal
- applied internal changes to create HTML with DOM functions

version 0.0.15.20210614.235900
- applied even more internal changes to create HTML with DOM functions

version 0.0.16.20210617.001900
- added clickable capsule names to show capsule contents
- added capsule rename option
- added changelog button and author information on settings menu
`;
    self.namespace = 'window.plugin.' + self.id + '.';
    self.pluginname = 'plugin-' + self.id;

    self.lastmenu = undefined;
    self.lastsortcolumn = {Items:'Type',Keys:'Portal',Capsules:'Name'};
    self.lastsortdirection = {
        Items:{Count:true,Type:true,Rarity:true,Capsules:true},
        Keys:{Count:true,Portal:true,Distance:true,Capsules:true},
        Capsules:{Capsule:true,Name:true,Count:true,Items:true,Keys:true,Type:true},
    };
    self.lastsortkeys = 'name';
    self.lastsortkeysdirection = 1;
    self.lastsortcapsule = 'name';
    self.lastsortcapsuledirection = 1;

    self.keyCount = [];
    self.itemCount = [];
    self.capsuleCount = [];
    self.keyGuidCount = {};
    self.keyIcon = '';
    self.inventoryexpires = 0;

    const KEY_SETTINGS = "plugin-live-inventory";
    self.settings = {
        displayMode: 'icon',
        capsuleNames: '',
        hideemptycapsules: false,
        selectedportalcapsulekeys: false,
    };

    const translations = {
        BOOSTED_POWER_CUBE: 'Hypercube', // resourceType
        CAPSULE: 'Capsule', // resourceType
        DRONE: 'Drone', // resourceType
        INTEREST_CAPSULE: 'Quantum Capsule', // resourceType
        KEY_CAPSULE: 'Key Capsule', // resourceType
        KINETIC_CAPSULE: 'Kinetic Capsule', // resourceType
        PLAYER_POWERUP: 'Apex', // resourceType
        PORTAL_LINK_KEY: 'Key', // resourceType
        PORTAL_POWERUP: 'Fracker', // resourceType
        EMITTER_A: 'Resonator',
        EMP_BURSTER: 'XMP',
        EXTRA_SHIELD: 'Aegis Shield',
        FLIP_CARD: 'Virus',
        FORCE_AMP: 'Force Amp',
        HEATSINK: 'HS',



        LINK_AMPLIFIER: 'LA',
        MEDIA: 'Media',
        MULTIHACK: 'Multi-Hack',



        POWER_CUBE: 'PC',
        RES_SHIELD: 'Shield',
        TRANSMUTER_ATTACK: 'ITO -',
        TRANSMUTER_DEFENSE: 'ITO +',
        TURRET: 'Turret',
        ULTRA_LINK_AMP: 'Ultra-Link',
        ULTRA_STRIKE: 'US',
    };

    function getSubscription(callback,errorcallback,retrycnt) {
        retrycnt = retrycnt || 0;
        window.postAjax('getHasActiveSubscription', {
        }, (data, textStatus, jqXHR) => {
            if (!data || !(data instanceof Object) || data.result !== true) {
                retrycnt--;
                if (retrycnt >= 0)
                    setTimeout(function() { getSubscription(callback,errorcallback,retrycnt); },500);
                else if (typeof errorcallback == 'function')
                    errorcallback(textStatus);
            } else if (typeof callback == 'function')
                callback(data);
        }, (jqXHR, textStatus, errorThrown) => {
            retrycnt--;
            if (retrycnt >= 0)
                setTimeout(function() { getSubscription(callback,errorcallback,retrycnt); },500);
            else if (typeof errorcallback == 'function')
                errorcallback(textStatus);
        });
    }

    function getInventory(callback,errorcallback,retrycnt) {
        retrycnt = retrycnt || 0;
        window.postAjax('getInventory', {
            'lastQueryTimestamp': 0
        }, (data, textStatus, jqXHR) => {
            if (!data || !(data instanceof Object) || !(data.result instanceof Object)) {
                retrycnt--;
                if (retrycnt >= 0)
                    setTimeout(function() { getInventory(callback,errorcallback,retrycnt); },500);
                else if (typeof errorcallback == 'function')
                    errorcallback(textStatus);
            } else if (typeof callback == 'function')
                callback(data);
        }, (jqXHR, textStatus, errorThrown) => {
            retrycnt--;
            if (retrycnt >= 0)
                setTimeout(function() { getInventory(callback,errorcallback,retrycnt); },500);
            else if (typeof errorcallback == 'function')
                errorcallback(textStatus);
        });
    }

    function parseCapsuleNames(str) {
        const reg = new RegExp(/^([0-9a-f]{8}):(.+)$/, 'i');
        str = str || '';
        const map = {};
        const rows = str.split('\n')
            .map(e => reg.exec(e))
            .filter(e => e && e.length === 3)
            .forEach(e => map[e[1]] = e[2]);
        return map;
    }

    function svgToIcon(str, s) {
        const url = ("data:image/svg+xml," + encodeURIComponent(str)).replace(/#/g, '%23');
        return new L.Icon({
            iconUrl: url,
            iconSize: [s, s],
            iconAnchor: [s / 2, s / 2],
            className: 'no-pointer-events', //allows users to click on portal under the unique marker
        })
    }

    function createIcons() {
        self.keyIcon = svgToIcon(`<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-key" width="44" height="44" viewBox="0 0 24 24" stroke-width="2" stroke="#ffffff" fill="none" stroke-linecap="round" stroke-linejoin="round">
<circle cx="8" cy="15" r="4" />
<line x1="10.85" y1="12.15" x2="19" y2="4" />
<line x1="18" y1="5" x2="20" y2="7" />
<line x1="15" y1="8" x2="17" y2="10" />
</svg>`, 15);
    }

    function addItemToCount(item, countMap, incBy, moniker) {
        let key;
        let type;
        let flipCardType;
        let newCountMap;
        let resourceRarity;
        if (item[2] && item[2].resource && item[2].timedPowerupResource) {
            key = `${item[2].resource.resourceType} ${item[2].timedPowerupResource.designation}`;
            type = `Powerup ${translations[item[2].timedPowerupResource.designation] || item[2].timedPowerupResource.designation}`;
            newCountMap = item[2].resource;
        } else if (item[2] && item[2].resource && item[2].flipCard) {
            key = `${item[2].resource.resourceType} ${item[2].flipCard.flipCardType}`;
            type = `${translations[item[2].resource.resourceType]} ${item[2].flipCard.flipCardType}`;
            newCountMap = item[2].resource;
            flipCardType = item[2].flipCard.flipCardType;
        } else if (item[2] && item[2].resource) {
            key = `${item[2].resource.resourceType} ${item[2].resource.resourceRarity}`;
            type = `${translations[item[2].resource.resourceType]}`;
            newCountMap = item[2].resource;
        } else if (item[2] && item[2].resourceWithLevels) {
            key = `${item[2].resourceWithLevels.resourceType} ${item[2].resourceWithLevels.level}`;
            type = `${translations[item[2].resourceWithLevels.resourceType]} ${item[2].resourceWithLevels.level}`;
            newCountMap = item[2].resourceWithLevels;
            resourceRarity = 'COMMON';
        } else if (item[2] && item[2].modResource) {
            key = `${item[2].modResource.resourceType} ${item[2].modResource.rarity}`;
            type = `${translations[item[2].modResource.resourceType]}`;
            newCountMap = item[2].modResource;
            resourceRarity = item[2].modResource.rarity;
        } else {
            console.log(item);
        }

		if (key) {
            if (!countMap[key]) {
                countMap[key] = newCountMap;
                countMap[key].count = 0;
                countMap[key].type = type;
                countMap[key].capsules = [];
                countMap[key].capsuleCounts = {};
            }
            if (flipCardType) countMap[key].flipCardType = flipCardType;
			if (resourceRarity) countMap[key].resourceRarity = resourceRarity;

            if (moniker && countMap[key].capsules.indexOf(moniker) === -1) {
                countMap[key].capsules.push(moniker);
                countMap[key].capsuleCounts[moniker] = 0;
            }
            if (moniker) countMap[key].capsuleCounts[moniker] += incBy;

            countMap[key].count += incBy;
		}
    }

    function prepareItemCounts(data) {
        if (!data || !data.result) {
            return [];
        }
        const countMap = {};
        data.result.forEach((item) => {
            addItemToCount(item, countMap, 1);
            if (item[2].container) {
                item[2].container.stackableItems.forEach((item2) => {
                    addItemToCount(item2.exampleGameEntity, countMap, item2.itemGuids.length, item[2].moniker.differentiator);
                });
            }
        });
        const countList = Object.values(countMap);
        countList.sort((a, b) => {
            if (a.type === b.type) {
                return 0;
            }
            return a.type > b.type ? 1 : -1;
        });
        return countList;
    }

    function HexToSignedFloat(num) {
        let int = parseInt(num, 16);
        if ((int & 0x80000000) === -0x80000000) {
            int = -1 * (int ^ 0xffffffff) + 1;
        }
        return int / 10e5;
    }

    function addKeyToCount(item, countMap, incBy, moniker) {
        if (item[2] && item[2].resource && item[2].resource.resourceType && item[2].resource.resourceType === 'PORTAL_LINK_KEY') {
            const key = `${item[2].portalCoupler.portalGuid}`;
            if (!countMap[key]) {
                countMap[key] = item[2];
                countMap[key].count = 0;
                countMap[key].capsules = [];
                countMap[key].capsuleCounts = {};
            }

            if (moniker && countMap[key].capsules.indexOf(moniker) === -1) {
                countMap[key].capsules.push(moniker);
                countMap[key].capsuleCounts[moniker] = 0;
            }
            if (moniker) countMap[key].capsuleCounts[moniker] = incBy;

            countMap[key].count += incBy;
        }
    }

    function prepareKeyCounts(data) {
        if (!data || !data.result) {
            return [];
        }
        const countMap = {};
        data.result.forEach((item) => {
            addKeyToCount(item, countMap, 1);
            if (item[2].container) {
                item[2].container.stackableItems.forEach((item2) => {
                    addKeyToCount(item2.exampleGameEntity, countMap, item2.itemGuids.length, item[2].moniker.differentiator);
                });
            }
        });
        const countList = Object.values(countMap);
        countList.sort((a, b) => {
            if (a.portalCoupler.portalTitle === b.portalCoupler.portalTitle) {
                return 0;
            }
            return a.portalCoupler.portalTitle.toLowerCase() > b.portalCoupler.portalTitle.toLowerCase() ? 1 : -1;
        });
        return countList;
    }

    function prepareCapsuleCounts(data) {
        if (!data || !data.result) {
            return [];
        }
        const countMap = {};
        data.result.forEach((item) => {
            if (item[2].container && item[2].moniker) {
                let id = item[2].moniker.differentiator;
                countMap[id] = {
                    id: id,
                    count: item[2].container.currentCount,
                    itemscount: 0,
                    keyscount: 0,
                    type: translations[item[2].resource.resourceType] || item[2].resource.resourceType,
                    items: [],
                    keys: []
                }
            }
        });

        for (let cnt = 0; cnt < self.keyCount.length; cnt++) {
            for (let cnt2 = 0; cnt2 < self.keyCount[cnt].capsules.length; cnt2++) {
                let id = self.keyCount[cnt].capsules[cnt2];
                countMap[id].keys = countMap[id].keys.concat(self.keyCount[cnt]);
                countMap[id].keyscount += self.keyCount[cnt].capsuleCounts[id];
            }
        }
        for (let cnt = 0; cnt < self.itemCount.length; cnt++) {
            if (self.itemCount[cnt].resourceType != "PORTAL_LINK_KEY") {
                for (let cnt2 = 0; cnt2 < self.itemCount[cnt].capsules.length; cnt2++) {
                    let id = self.itemCount[cnt].capsules[cnt2];
                    countMap[id].items = countMap[id].items.concat(self.itemCount[cnt]);
                    countMap[id].itemscount += self.itemCount[cnt].capsuleCounts[id];
                }
            }
        }

        const countList = Object.values(countMap);
        countList.sort((a, b) => {
            if (a.type === b.type) {
                return 0;
            }
            return a.type > b.type ? 1 : -1;
        });

        return countList;
    }

    function setCapsuleLinks(elementcapsules,capsuleCounts,capsulescell) {
        if (elementcapsules.length == 0) return;

        const capsuleNames = parseCapsuleNames(self.settings.capsuleNames);

        let capsules = [];
        for (let cnt = 0; cnt < elementcapsules.length; cnt++) {
            let capsuleid = elementcapsules[cnt];
            capsules.push({
                id: capsuleid,
                name: (capsuleNames[capsuleid] || ''),
                count: capsuleCounts[capsuleid]
            });
        }
        capsules.sort(function(a, b) {
            if (a.name + a.id === b.name + a.id) {
                return 0;
            }
            return (a.name + a.id > b.name + a.id ? 1 : -1);
        });

        if (capsules.length == 1) {
            let capsulelink = capsulescell.appendChild(document.createElement('a'));
            capsulelink.style.display = 'block';
            capsulelink.textContent = (capsules[0].name || capsules[0].id) + ' (' + capsules[0].count + ')';
            capsulelink.addEventListener('click', function(e) {
                e.preventDefault();
                showCapsuleContent(capsules[0].id);
            }, false);
        } else if (capsules.length > 1) {
            let capsuleslist = capsulescell.appendChild(document.createElement('select'));
            capsules.map(function(capsule) {
                let option = capsuleslist.appendChild(document.createElement('option'));
                option.value = capsule.id;
                option.textContent = (capsule.name || capsule.id) + ' (' + capsule.count + ')';
            });
            let capsulebutton = capsulescell.appendChild(document.createElement('input'));
            capsulebutton.type = 'button';
            capsulebutton.value = 'O';
            capsulebutton.addEventListener('click', function(e) {
                e.preventDefault();
                showCapsuleContent(capsuleslist.value);
            }, false);
        }
    };

    function setKeyTableBody(keys,tablebody,orderBy, direction,filtercapsuleid) {
        while (tablebody.rows.length > 0) {
            tablebody.deleteRow(0);
        }

        const sortFunctions = {
            Count: (a, b) => (a.count - b.count) * (direction ? 1 : -1),
            Portal: (a, b) => {
                if (a.portalCoupler.portalTitle === b.portalCoupler.portalTitle) {
                    return 0;
                }
                return (a.portalCoupler.portalTitle.toLowerCase() > b.portalCoupler.portalTitle.toLowerCase() ? 1 : -1) * (direction ? 1 : -1);
            },
            Distance: (a, b) => (a._distance - b._distance) * (direction ? 1 : -1),
            Capsules: (a, b) => {
                const sA = a.capsules.join(', ').toLowerCase();
                const sB = b.capsules.join(', ').toLowerCase();
                if (sA === sB) {
                    return 0;
                }
                return (sA > sB ? 1 : -1) * (direction ? 1 : -1);
            }
        };
        keys.sort(sortFunctions[orderBy]);
        keys.map((el) => {
            let row = tablebody.appendChild(document.createElement('tr'));
            let countcell = row.appendChild(document.createElement('td'));
            countcell.align = 'right';
            countcell.textContent = (filtercapsuleid ? el.capsuleCounts[filtercapsuleid] : el.count);

            let portalcell = row.appendChild(document.createElement('td'));
            let portallink = portalcell.appendChild(document.createElement('a'));
            portallink.textContent = el.portalCoupler.portalTitle;
            portallink.href = "//intel.ingress.com/?pll=" + el._latlng.lat + "," + el._latlng.lng;
            portallink.addEventListener('click', function(e) {
                e.preventDefault();
                window.zoomToAndShowPortal(el.portalCoupler.portalGuid,[el._latlng.lat,el._latlng.lng]);
            },false);

            let distancecell = row.appendChild(document.createElement('td'));
            distancecell.align = 'right';
            distancecell.textContent = el._formattedDistance;

            if (!filtercapsuleid) {
                let capsulescell = row.appendChild(document.createElement('td'));
                capsulescell.style.whiteSpace = 'nowrap';
                setCapsuleLinks(el.capsules,el.capsuleCounts,capsulescell);
            }
        });
    }

    function setItemTableBody(items,tablebody,orderBy, direction,filtercapsuleid) {
        while (tablebody.rows.length > 0) {
            tablebody.deleteRow(0);
        }

        const sortFunctions = {
            Type: (a, b) => {
                if (a.type === b.type) {
                    return 0;
                }
                return (a.type.toLowerCase() > b.type.toLowerCase() ? 1 : -1) * (direction ? 1 : -1);
            },
            Rarity: (a, b) => {
                if (a.resourceRarity === b.resourceRarity) {
                    return 0;
                }
                return (a.resourceRarity.toLowerCase() > b.resourceRarity.toLowerCase() ? 1 : -1) * (direction ? 1 : -1);
            },
            Count: (a, b) => (a.count - b.count) * (direction ? 1 : -1),
            Capsules: (a, b) => {
                const sA = a.capsules.join(', ').toLowerCase();
                const sB = b.capsules.join(', ').toLowerCase();
                if (sA === sB) {
                    return 0;
                }
                return (sA > sB ? 1 : -1) * (direction ? 1 : -1);
            }
        };
        items.sort(sortFunctions[orderBy]);
        items.map((el) => {
            let row = tablebody.appendChild(document.createElement('tr'));

            let countcell = row.appendChild(document.createElement('td'));
            countcell.align = 'right';
            countcell.textContent = (filtercapsuleid ? el.capsuleCounts[filtercapsuleid] : el.count);

            let typecell = row.appendChild(document.createElement('td'));
            typecell.textContent = el.type;

            let raritycell = row.appendChild(document.createElement('td'));
            raritycell.textContent = (el.resourceRarity || '');

            if (!filtercapsuleid) {
                let capsulescell = row.appendChild(document.createElement('td'));
                capsulescell.style.whiteSpace = 'nowrap';
                setCapsuleLinks(el.capsules,el.capsuleCounts,capsulescell);
            }
        });
    }

    function setCapsulesTableBody(capsules,tablebody,orderBy, direction) {
        const capsuleNames = parseCapsuleNames(self.settings.capsuleNames);

        const sortFunctions = {
            Capsule: (a, b) => {
                if (a.id === b.id) {
                    return 0;
                }
                return (a.id > b.id ? 1 : -1) * (direction ? 1 : -1);
            },
            Name: (a, b) => {
                let namea = (capsuleNames[a.id] || a.id).toLowerCase();
                let nameb = (capsuleNames[b.id] || b.id).toLowerCase();
                if (namea === nameb) {
                    return 0;
                }
                return (namea > nameb ? 1 : -1) * (direction ? 1 : -1);
            },
            Count: (a, b) => (a.count - b.count) * (direction ? 1 : -1),
            Items: (a, b) => (a.itemscount - b.itemscount) * (direction ? 1 : -1),
            Keys: (a, b) => (a.keyscount - b.keyscount) * (direction ? 1 : -1),
            Type: (a, b) => {
                if (a.type === b.type) {
                    return 0;
                }
                return (a.type > b.type ? 1 : -1) * (direction ? 1 : -1);
            }
        };

        while (tablebody.rows.length > 0) {
            tablebody.deleteRow(0);
        }

        capsules.sort(sortFunctions[orderBy]);
        capsules.map((el) => {
            if (!(self.settings.hideemptycapsules && el.count == 0)) {
                let row = tablebody.appendChild(document.createElement('tr'));

                let capsulecell = row.appendChild(document.createElement('td'));

                let capsulelink = capsulecell.appendChild(document.createElement('a'));
                capsulelink.style.display = 'block';
                capsulelink.textContent = el.id;
                capsulelink.addEventListener('click', function(e) {
                    e.preventDefault();
                    showCapsuleContent(el.id);
                }, false);

                let namecell = row.appendChild(document.createElement('td'));
                namecell.textContent = (capsuleNames[el.id] || '');

                let countcell = row.appendChild(document.createElement('td'));
                countcell.align = 'right';
                countcell.textContent = (el.count || '');

                let itemscountcell = row.appendChild(document.createElement('td'));
                itemscountcell.align = 'right';
                itemscountcell.textContent = (el.itemscount || '');

                let keyscountcell = row.appendChild(document.createElement('td'));
                keyscountcell.align = 'right';
                keyscountcell.textContent = (el.keyscount || '');

                let typecell = row.appendChild(document.createElement('td'));
                typecell.textContent = el.type;
            }
        });
    }

    function exportItems() {
        const capsuleNames = parseCapsuleNames(self.settings.capsuleNames);
        function getCapsulesNameCount(el) {
            let capsules = [];
            for (let cnt = 0; cnt < el.capsules.length; cnt++) {
                let capsuleid = el.capsules[cnt];
                let capsulename = (capsuleNames[capsuleid] || capsuleid);
                capsules.push(capsulename + ' (' + el.capsuleCounts[capsuleid] + ')');
            }
            return capsules.sort();
        }
        const str = ['Type\tRarity\tCount', ...self.itemCount.map((i) => [i.type, i.resourceRarity, i.count, getCapsulesNameCount(i).join(',')].join('\t'))].join('\n');
        navigator.clipboard.writeText(str);
        alert('Items are copied to your clipboard');
    }

    function exportKeys() {
        const capsuleNames = parseCapsuleNames(self.settings.capsuleNames);
        function getCapsulesNameCount(el) {
            let capsules = [];
            for (let cnt = 0; cnt < el.capsules.length; cnt++) {
                let capsuleid = el.capsules[cnt];
                let capsulename = (capsuleNames[capsuleid] || capsuleid);
                capsules.push(capsulename + ' (' + el.capsuleCounts[capsuleid] + ')');
            }
            return capsules.sort();
        }
        const str = ['Name\tLink\tGUID\tKeys\tCapsules', ...self.keyCount.map((el) => [el.portalCoupler.portalTitle, `https//intel.ingress.com/?pll=${el._latlng.lat},${el._latlng.lng}`, el.portalCoupler.portalGuid, el.count, getCapsulesNameCount(el).join(',')].join('\t'))].join('\n');
        navigator.clipboard.writeText(str);
        alert('Keys are copied to your clipboard');
    }

    self.updateMenu = function() {
        // update menu, if visible
        if (document.getElementById('dialog-' + self.id))
            self.menu();
    };

    self.menu = function(submenu) {
        if (typeof submenu != 'string') submenu = self.lastmenu;
        submenu = (submenu || 'Items');
        self.lastmenu = submenu;

        let container = document.createElement('div');
        let buttonarea = container.appendChild(document.createElement('form'));
        let menuitemsbutton = buttonarea.appendChild(document.createElement('input'));
        menuitemsbutton.type = 'button';
        menuitemsbutton.value = 'Items';
        menuitemsbutton.style.marginRight = '5px';
        menuitemsbutton.addEventListener('click', function(e) {
            e.preventDefault();
            self.menu('Items');
        },false);
        let menukeysbutton = buttonarea.appendChild(document.createElement('input'));
        menukeysbutton.type = 'button';
        menukeysbutton.value = 'Keys';
        menukeysbutton.style.marginRight = '5px';
        menukeysbutton.addEventListener('click', function(e) {
            e.preventDefault();
            self.menu('Keys');
        },false);
        let menucapsulesbutton = buttonarea.appendChild(document.createElement('input'));
        menucapsulesbutton.type = 'button';
        menucapsulesbutton.value = 'Capsules';
        menucapsulesbutton.style.marginRight = '5px';
        menucapsulesbutton.addEventListener('click', function(e) {
            e.preventDefault();
            self.menu('Capsules');
        },false);
        let menusettingsbutton = buttonarea.appendChild(document.createElement('input'));
        menusettingsbutton.type = 'button';
        menusettingsbutton.value = 'Settings';
        menusettingsbutton.addEventListener('click', function(e) {
            e.preventDefault();
            self.menu('Settings');
        },false);

        let inventoryarea = container.appendChild(document.createElement('div'));
        inventoryarea.id = 'live-inventory';

        if (submenu == 'Items') {
            let tablearea = inventoryarea.appendChild(document.createElement('div'));

            let sortabletable = tablearea.appendChild(document.createElement('table'));
            sortabletable.style.maxHeight = ((isSmartphone() ? document.body.clientHeight : window.innerHeight - 100) - 105) + 'px';

            let tableheader = sortabletable.appendChild(document.createElement('thead'));

            let headerrow = tableheader.appendChild(document.createElement('tr'));

            let tablebody = sortabletable.appendChild(document.createElement('tbody'));
            setItemTableBody(self.itemCount, tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]]);

            ['Count','Type','Rarity','Capsules'].map(function(column) {
                let header = headerrow.appendChild(document.createElement('th'));
                header.textContent = column;
                header.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (self.lastsortcolumn[submenu] == this.textContent)
                        self.lastsortdirection[submenu][self.lastsortcolumn[submenu]] = !self.lastsortdirection[submenu][self.lastsortcolumn[submenu]];
                    else
                        self.lastsortcolumn[submenu] = this.textContent;

                    setItemTableBody(self.itemCount, tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]]);
                },false);
            });
        } else if (submenu == 'Keys') {
            let tablearea = inventoryarea.appendChild(document.createElement('div'));

            let sortabletable = tablearea.appendChild(document.createElement('table'));
            sortabletable.style.maxHeight = ((isSmartphone() ? document.body.clientHeight : window.innerHeight - 100) - 105) + 'px';

            let tableheader = sortabletable.appendChild(document.createElement('thead'));

            let headerrow = tableheader.appendChild(document.createElement('tr'));

            let tablebody = sortabletable.appendChild(document.createElement('tbody'));
            setKeyTableBody(self.keyCount, tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]]);

            ['Count','Portal','Distance','Capsules'].map(function(column) {
                let header = headerrow.appendChild(document.createElement('th'));
                header.textContent = column;
                header.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (self.lastsortcolumn[submenu] == this.textContent)
                        self.lastsortdirection[submenu][self.lastsortcolumn[submenu]] = !self.lastsortdirection[submenu][self.lastsortcolumn[submenu]];
                    else
                        self.lastsortcolumn[submenu] = this.textContent;

                    setKeyTableBody(self.keyCount, tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]]);
                },false);
            });
        } else if (submenu == 'Capsules') {
            let togglebutton = inventoryarea.appendChild(document.createElement('input'));
            togglebutton.type = 'button';
            togglebutton.value = 'Edit capsule names';

            let hideemptycheckboxarea = inventoryarea.appendChild(document.createElement('label'));
            let hideemptycheckbox = hideemptycheckboxarea.appendChild(document.createElement('input'));
            hideemptycheckbox.type = 'checkbox';
            hideemptycheckbox.checked = self.settings.hideemptycapsules;
            hideemptycheckbox.style.userSelect = 'none';
            hideemptycheckboxarea.appendChild(document.createTextNode('Hide empty capsules'));

            let editorarea = inventoryarea.appendChild(document.createElement('div'));
            editorarea.style.display = 'none';
            let capsuletextarea = editorarea.appendChild(document.createElement('textarea'));
            capsuletextarea.placeholder = "CAPSULEID:Display name";
            capsuletextarea.value = (self.settings.capsuleNames || '');
            capsuletextarea.style.height = '200px';
            capsuletextarea.style.minWidth = '400px';
            capsuletextarea.style.resize = 'none';

            editorarea.appendChild(document.createElement('br'));
            editorarea.appendChild(document.createTextNode('Formatting (one on each row): CAPSULEID:Display name'));
            editorarea.appendChild(document.createElement('br'));
            let savebutton = editorarea.appendChild(document.createElement('input'));
            savebutton.type = 'button';
            savebutton.value = 'Save names';

            let tablearea = inventoryarea.appendChild(document.createElement('div'));

            let sortabletable = tablearea.appendChild(document.createElement('table'));
            sortabletable.style.maxHeight = ((isSmartphone() ? document.body.clientHeight : window.innerHeight - 100) - 105 - 25) + 'px';

            let tableheader = sortabletable.appendChild(document.createElement('thead'));

            let headerrow = tableheader.appendChild(document.createElement('tr'));

            let tablebody = sortabletable.appendChild(document.createElement('tbody'));
            setCapsulesTableBody(self.capsuleCount,tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]]);

            togglebutton.addEventListener('click', function(e) {
                e.preventDefault();
                if (editorarea.style.display == 'none') {
                    editorarea.style.display = 'block';
                    sortabletable.style.maxHeight = ((isSmartphone() ? document.body.clientHeight : window.innerHeight - 100) - 105 - 25 - 245) + 'px';
                } else {
                    editorarea.style.display = 'none';
                    sortabletable.style.maxHeight = ((isSmartphone() ? document.body.clientHeight : window.innerHeight - 100) - 105 - 25) + 'px';
                }
            },false);
            savebutton.addEventListener('click', function(e) {
                e.preventDefault();
                self.settings.capsuleNames = capsuletextarea.value;
                self.saveSettings();
                if (window.selectedPortal) {
                    portalDetailsUpdated({guid:window.selectedPortal});
                    showSelectedPortalCapsuleKeys({selectedPortalGuid: window.selectedPortal, unselectedPortalGuid: undefined});
                }
                setCapsulesTableBody(self.capsuleCount,tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]]);
            },false);
            hideemptycheckbox.addEventListener('change', function(e) {
                e.preventDefault();
                self.settings.hideemptycapsules = this.checked;
                self.saveSettings();
                setCapsulesTableBody(self.capsuleCount,tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]]);
            },false);

            ['Capsule','Name','Count','Items','Keys','Type'].map(function(column) {
                let header = headerrow.appendChild(document.createElement('th'));
                header.textContent = column;
                header.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (self.lastsortcolumn[submenu] == this.textContent)
                        self.lastsortdirection[submenu][self.lastsortcolumn[submenu]] = !self.lastsortdirection[submenu][self.lastsortcolumn[submenu]];
                    else
                        self.lastsortcolumn[submenu] = this.textContent;

                    setCapsulesTableBody(self.capsuleCount,tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]]);
                },false);
            });
        } else if (submenu == 'Settings') {
            inventoryarea.appendChild(document.createTextNode('Keys Layer display mode:'));
            inventoryarea.appendChild(document.createElement('br'));

            let modeselector = container.appendChild(document.createElement('select'));
            modeselector.id = 'live-inventory-settings--mode';
            let optionKeyIcon = modeselector.appendChild(document.createElement('option'));
            optionKeyIcon.value = 'icon';
            optionKeyIcon.textContent = 'Key icon';
            optionKeyIcon.selected = (self.settings.displayMode == 'icon');
            let optionKeyCount = modeselector.appendChild(document.createElement('option'));
            optionKeyCount.value = 'count';
            optionKeyCount.textContent = 'Number of keys';
            optionKeyCount.selected = (self.settings.displayMode == 'count');
            let optionKeyCapsules = modeselector.appendChild(document.createElement('option'));
            optionKeyCapsules.value = 'capsules';
            optionKeyCapsules.textContent = 'Keys (+ keys in capsules)';
            optionKeyCapsules.selected = (self.settings.displayMode == 'capsules');

            container.appendChild(document.createElement('br'));

            let selectedportalcheckboxarea = container.appendChild(document.createElement('label'));
            selectedportalcheckboxarea.style.display = 'block';
            let selectedportalcheckbox = selectedportalcheckboxarea.appendChild(document.createElement('input'));
            selectedportalcheckbox.type = 'checkbox';
            selectedportalcheckbox.style.userSelect = 'none';
            selectedportalcheckbox.checked = self.settings.selectedportalcapsulekeys;
            selectedportalcheckbox.disabled = (self.settings.displayMode == 'icon');
            selectedportalcheckboxarea.appendChild(document.createTextNode('Show detailed keys in capsules for selected portal'));

            let changelogbutton = container.appendChild(document.createElement('a'));
            changelogbutton.textContent = 'Changelog';
            changelogbutton.addEventListener('click', function(e) {
                e.preventDefault();
                alert(self.changelog);
            },false);

            let author = container.appendChild(document.createElement('div'));
            author.className = self.id + 'author';
            author.textContent = self.title + ' version ' + self.version + ' by ' + self.author;

            modeselector.addEventListener('change', function(e) {
                e.preventDefault();
                self.settings.displayMode = this.value;
                selectedportalcheckbox.disabled = (self.settings.displayMode == 'icon');
                self.saveSettings();
                self.removeAllIcons();
                self.checkShowAllIcons();
                if (window.selectedPortal) portalDetailsUpdated({guid:window.selectedPortal});
            },false);

            selectedportalcheckbox.addEventListener('change', function(e) {
                e.preventDefault();
                self.settings.selectedportalcapsulekeys = this.checked;
                self.saveSettings();
                if (window.selectedPortal) {
                    if (self.settings.selectedportalcapsulekeys)
                        showSelectedPortalCapsuleKeys({selectedPortalGuid: window.selectedPortal, unselectedPortalGuid: undefined});
                    else {
                        removeKeyFromLayer({portal:window.portals[window.selectedPortal]});
                        addKeyToLayer({portal:window.portals[window.selectedPortal]});
                    }
                }
            },false);
        }

        window.dialog({
            html: container,
            title: self.title + ' - ' + submenu,
            id: self.id,
            width: 'auto',
            height: (isSmartphone() || submenu == 'Settings' ? 'auto' : window.innerHeight - 100)
        }).dialog('option', 'buttons', {
            'Refresh': refreshInventory,
            'Copy Items': exportItems,
            'Copy Keys': exportKeys,
            'Close': function () {
                $(this).dialog('close');
            },
        });
    };

    function preparePortalKeyMap() {
        const keyMap = {};
        self.keyCount.forEach((k) => {
            keyMap[k.portalCoupler.portalGuid] = k;
        });
        return keyMap;
    }

    function formatDistance(dist) {
        if (dist >= 10000) {
            dist = Math.round(dist / 1000) + ' km';
        } else if (dist >= 1000) {
            dist = Math.round(dist / 100) / 10 + ' km';
        } else {
            dist = Math.round(dist) + ' m';
        }

        return dist;
    }

    function updateDistances() {
        const center = window.map.getCenter();
        self.keyCount.forEach((k) => {
            if (!k._latlng) {
                k._latlng = L.latLng.apply(L, k.portalCoupler.portalLocation.split(',').map(e => {
                    return HexToSignedFloat(e);
                }));
            }
            k._distance = k._latlng.distanceTo(center);
            k._formattedDistance = formatDistance(k._distance);
        });
    }

    function decodeInventoryData(data) {
        self.itemCount = prepareItemCounts(data);
        self.keyCount = prepareKeyCounts(data);
        self.keyMap = preparePortalKeyMap();

        for (const guid in self.keyMap) {
            self.keyMap[guid].totalincapsules = 0;
            for (const capsuleid in self.keyMap[guid].capsuleCounts) {
                self.keyMap[guid].totalincapsules += self.keyMap[guid].capsuleCounts[capsuleid];
            }
            self.keyMap[guid].totaloutcapsules = self.keyMap[guid].count - self.keyMap[guid].totalincapsules;
        }

        self.keyGuidCount = {};
        for (let cnt = 0; cnt < self.keyCount.length; cnt++) {
            self.keyGuidCount[self.keyCount[cnt].portalCoupler.portalGuid] = self.keyCount[cnt].count;
        }

        self.capsuleCount = prepareCapsuleCounts(data);

        updateDistances();
        self.updateMenu();
    }

    function nicetimestring(milliseconds) {
        let str;
        let seconds = Math.floor(milliseconds / 1000);
        if (seconds < 60)
            str = seconds + ' seconds';
        else {
            let minutes = Math.floor(seconds / 60);
            seconds = seconds % 60;
            if (minutes > 5)
                str = minutes + ' minutes';
            else
                str = minutes + ':' + (seconds<10?'0':'') + seconds + ' minutes';
        }

        return str;
    };

    function loadInventory(silent,retry) {
        try {
            let localData = localStorage[KEY_SETTINGS];
            if (!localData || localData == "") return;
            localData = JSON.parse(localData);
            if (!(localData instanceof Object)) return;
            if ('settings' in localData && localData.settings instanceof Object) {
                for (const key in self.settings) {
                    if (key in localData.settings && typeof self.settings[key] == typeof localData.settings[key]) {
                        self.settings[key] = localData.settings[key];
                    }
                }
            }
            if ('data' in localData && localData.data instanceof Object) {
                decodeInventoryData(localData.data);
            }
            if ('expires' in localData && typeof localData.expires == 'number') {
                self.inventoryexpires = localData.expires;
            }
        } catch (e) {
            console.log('loadInventory error',e);
        }
    };

    function refreshInventory(silent,retrysubscription,retryinventory) {
        if (self.inventoryexpires > Date.now()) { // do not update
            if (silent === true)
                console.log(self.title + ' - Inventory was recently updated, wait ' + nicetimestring(self.inventoryexpires - Date.now()));
            else {
                let container = document.createElement('div');
                let text = container.appendChild(document.createElement('p'));
                text.textContent = 'Inventory was recently updated, wait ' + nicetimestring(self.inventoryexpires - Date.now());
                let refreshbutton = container.appendChild(document.createElement('button'));
                refreshbutton.textContent = 'Refresh anyway';
                refreshbutton.addEventListener('click', function(e) {
                    e.preventDefault();
                    refreshbutton.disabled = true;
                    refreshbutton.textContent = 'Refreshing now';
                    self.saveExpireValue(Date.now() - 1 * 60); // expire
                    refreshInventory();
                }, false);
                window.dialog({
                    html: container,
                    title: self.title + ' - Refresh',
                    id: self.id,
                }).dialog('option', 'buttons', {
                    '< Main menu': self.menu,
                    'Close': function () {
                        $(this).dialog('close');
                    },
                });
            }
            return;
        }

        console.log(self.title + ' - Checking subscription status...');
        getSubscription(
            function(data) {
                console.log(self.title + ' - Player has active subscription');
                console.log(self.title + ' - Updating inventory...');
                getInventory(
                    function(data) {
                        console.log(self.title + " - Inventory data received");
                        self.storeInventoryData(data);

                        decodeInventoryData(data);
                        window.runHooks('pluginLiveInventoryUpdated', {
                            itemCount: self.itemCount,
                            keyCount: self.keyCount,
                            keyMap: self.keyMap
                        });
                        // update keys on map
                        self.removeAllIcons();
                        self.checkShowAllIcons();
                        // update menu, if visible
                        self.updateMenu();
                        if (window.selectedPortal) portalDetailsUpdated({guid:window.selectedPortal});
                        if (silent !== true)
                            alert("OKAY - Inventory was updated succesfuly");
                    },
                    function(error) {
                        console.error(self.title + " - Failed to get inventory after 2 retries");
                        if (silent !== true) {
                            alert("FAILED - Inventory update failed");
                        }
                    },
                    2);
            },
            function(error) {
                console.error(self.title + " - Failed to get subscription after 2 retries");
                if (silent !== true) {
                    alert("FAILED - Subscription check failed, inventory update skipped");
                }
            },
            2);
    };

    self.storeInventoryData = function(data) {
        self.inventoryexpires = Date.now() + 10 * 60 * 1000; // request data only once per 10 minutes, or we might hit a rate limit
        localStorage[KEY_SETTINGS] = JSON.stringify({
            data: data,
            expires: self.inventoryexpires,
            settings: self.settings
        });
    };

    self.saveExpireValue = function(expires) {
        self.inventoryexpires = expires;
        const ls = {};
        try {
            const localData = JSON.parse(localStorage[KEY_SETTINGS]);
            ls.data = localData.data;
            ls.settings = localData.settings;
        } catch (e) {}
        ls.expires = expires;
        localStorage[KEY_SETTINGS] = JSON.stringify(ls);
    };

    self.saveSettings = function() {
        const ls = {};
        try {
            const localData = JSON.parse(localStorage[KEY_SETTINGS]);
            ls.data = localData.data;
            ls.expires = self.inventoryexpires;
        } catch (e) {}
        ls.settings = self.settings;
        localStorage[KEY_SETTINGS] = JSON.stringify(ls);
    };

    function showCapsuleContent(capsuleid,submenu) {
        const capsuleNames = parseCapsuleNames(self.settings.capsuleNames);
        let capsulename = capsuleNames[capsuleid];
        let capsule = undefined;
        for (let cnt = 0; cnt < self.capsuleCount.length; cnt++) {
            if (self.capsuleCount[cnt].id == capsuleid) {
                capsule = self.capsuleCount[cnt];
                break;
            }
        }
        if (!capsule) {
            alert('Capsule not found: ' + capsuleid);
            return;
        }

        if (typeof submenu != 'string') submenu = 'Items';
        submenu = (submenu || 'Items');

        if (capsule.count == 0) {
            alert(capsule.type + ' is empty' + (capsulename ? ' (' + capsuleid + '): ' + capsulename : ': ' + capsuleid));
            return;
        }
        if (submenu == 'Items' && capsule.itemscount == 0) {
            submenu = 'Keys';
        } else if (submenu == 'Keys' && capsule.keyscount == 0) {
            submenu = 'Items';
        }

        let container = document.createElement('div');
        let buttonarea = container.appendChild(document.createElement('form'));
        let menuitemsbutton = buttonarea.appendChild(document.createElement('input'));
        menuitemsbutton.type = 'button';
        menuitemsbutton.value = 'Items';
        menuitemsbutton.style.marginRight = '5px';
        menuitemsbutton.disabled = (capsule.itemscount == 0);
        menuitemsbutton.addEventListener('click', function(e) {
            e.preventDefault();
            showCapsuleContent(capsuleid,'Items');
        },false);
        let menukeysbutton = buttonarea.appendChild(document.createElement('input'));
        menukeysbutton.type = 'button';
        menukeysbutton.value = 'Keys';
        menukeysbutton.style.marginRight = '5px';
        menukeysbutton.disabled = (capsule.keyscount == 0);
        menukeysbutton.addEventListener('click', function(e) {
            e.preventDefault();
            showCapsuleContent(capsuleid,'Keys');
        },false);
        buttonarea.appendChild(document.createTextNode('Items: ' + capsule.itemscount + ' Keys: ' + capsule.keyscount + ' Total: ' + capsule.count));

        let inventoryarea = container.appendChild(document.createElement('div'));
        inventoryarea.id = 'live-inventory';

        if (submenu == 'Items') {
            let tablearea = inventoryarea.appendChild(document.createElement('div'));

            let sortabletable = tablearea.appendChild(document.createElement('table'));
            sortabletable.style.maxHeight = ((isSmartphone() ? document.body.clientHeight : window.innerHeight - 100) - 105) + 'px';

            let tableheader = sortabletable.appendChild(document.createElement('thead'));

            let headerrow = tableheader.appendChild(document.createElement('tr'));

            let tablebody = sortabletable.appendChild(document.createElement('tbody'));
            setItemTableBody(capsule.items, tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]],capsuleid);

            ['Count','Type','Rarity'].map(function(column) {
                let header = headerrow.appendChild(document.createElement('th'));
                header.textContent = column;
                header.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (self.lastsortcolumn[submenu] == this.textContent)
                        self.lastsortdirection[submenu][self.lastsortcolumn[submenu]] = !self.lastsortdirection[submenu][self.lastsortcolumn[submenu]];
                    else
                        self.lastsortcolumn[submenu] = this.textContent;

                    setItemTableBody(capsule.items, tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]],capsuleid);
                },false);
            });
        } else if (submenu == 'Keys') {
            let tablearea = inventoryarea.appendChild(document.createElement('div'));

            let sortabletable = tablearea.appendChild(document.createElement('table'));
            sortabletable.style.maxHeight = ((isSmartphone() ? document.body.clientHeight : window.innerHeight - 100) - 105) + 'px';

            let tableheader = sortabletable.appendChild(document.createElement('thead'));

            let headerrow = tableheader.appendChild(document.createElement('tr'));

            let tablebody = sortabletable.appendChild(document.createElement('tbody'));
            setKeyTableBody(capsule.keys, tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]],capsuleid);

            ['Count','Portal','Distance'].map(function(column) {
                let header = headerrow.appendChild(document.createElement('th'));
                header.textContent = column;
                header.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (self.lastsortcolumn[submenu] == this.textContent)
                        self.lastsortdirection[submenu][self.lastsortcolumn[submenu]] = !self.lastsortdirection[submenu][self.lastsortcolumn[submenu]];
                    else
                        self.lastsortcolumn[submenu] = this.textContent;

                    setKeyTableBody(capsule.keys, tablebody, self.lastsortcolumn[submenu], self.lastsortdirection[submenu][self.lastsortcolumn[submenu]],capsuleid);
                },false);
            });
        }

        let dialogheight = 140 + 17 * (submenu == 'Keys' ? capsule.keys.length : capsule.items.length);
        if (dialogheight > window.innerHeight - 100) dialogheight = window.innerHeight - 100;

        window.dialog({
            html: container,
            title: self.title + ' - ' + capsule.type + (capsulename ? ' (' + capsuleid + '): ' + capsulename : ': ' + capsuleid),
            id: capsuleid,
            width: 'auto',
            height: (isSmartphone() ? 'auto' : dialogheight)
        }).dialog('option', 'buttons', {
            'Rename': function () {
                let newname = prompt('Enter new capsule name (' + capsuleid + '):',capsulename);
                if (newname == null || newname == capsulename) return;

                let capsuleNames = parseCapsuleNames(self.settings.capsuleNames);
                capsuleNames[capsuleid] = newname;
                let capsuleNamesList = [];
                for (const id in capsuleNames) {
                    capsuleNamesList.push(id + ':' + capsuleNames[id]);
                }
                self.settings.capsuleNames = capsuleNamesList.join("\n");
                self.saveSettings();
                if (window.selectedPortal) {
                    portalDetailsUpdated({guid:window.selectedPortal});
                    showSelectedPortalCapsuleKeys({selectedPortalGuid: window.selectedPortal, unselectedPortalGuid: undefined});
                }
                self.updateMenu();
                showCapsuleContent(capsuleid,submenu);
            },
            'Close': function () {
                $(this).dialog('close');
            },
        });
    }

    function portalDetailsUpdated(p) { // {guid: guid, portal: portal, portalDetails: details, portalData: data}
        $('.randdetails-keys').remove();

        if (!self.keyMap) {
            return;
        }

        const countData = self.keyMap[p.guid];
        if (!countData) {
            return;
        }
        const capsuleNames = parseCapsuleNames(self.settings.capsuleNames);
        let capsules = [];
        for (let cnt = 0; cnt < countData.capsules.length; cnt++) {
            let capsuleid = countData.capsules[cnt];
            capsules.push({
                id: capsuleid,
                name: (capsuleNames[capsuleid] || ''),
                count: countData.capsuleCounts[capsuleid]
            });
        }
        capsules.sort(function(a, b) {
            if (a.name + a.id === b.name + a.id) {
                return 0;
            }
            return (a.name + a.id > b.name + a.id ? 1 : -1);
        });
        let keysrow = document.createElement('tr');
        keysrow.className = 'randdetails-keys';
        let keyscell = keysrow.appendChild(document.createElement('td'));
        if (self.settings.displayMode == 'capsules') {
            let totalstext = [];
            if (countData.totaloutcapsules > 0) totalstext.push(countData.totaloutcapsules);
            if (countData.totalincapsules > 0) totalstext.push('(' + countData.totalincapsules + ')');
            keyscell.textContent = totalstext.join(' ');
        } else {
            keyscell.textContent = countData.count;
        }
        let keysheadercell = keysrow.appendChild(document.createElement('th'));
        keysheadercell.textContent = 'Keys';
        let capsulesheadercell = keysrow.appendChild(document.createElement('th'));
        capsulesheadercell.textContent = (capsules.length?'Capsules':'');
        let capsulescell = keysrow.appendChild(document.createElement('th'));
        capsulescell.className = 'randdetails-capsules';
        capsules.map(function(c) {
            let capsulelink = capsulescell.appendChild(document.createElement('a'));
            capsulelink.style.display = 'block';
            capsulelink.textContent = (c.name || c.id) + ' (' + c.count + ')';
            capsulelink.addEventListener('click', function(e) {
                e.preventDefault();
                showCapsuleContent(c.id);
            }, false);
        });

        $(keysrow).appendTo($('#randdetails tbody'));
    }

    function addKeyToLayer(data) { // {portal: marker, previousData: previousData}
        const tileParams = window.getCurrentZoomTileParameters ? window.getCurrentZoomTileParameters() : window.getMapZoomTileParameters(window.getDataZoomForMapZoom(window.map.getZoom()));
        if (tileParams.level !== 0) {
            return;
        }

        if (self.keyMap && data.portal.options.guid in self.keyMap && !data.portal._keyMarker) {
            let icontext;
            if (self.settings.displayMode === 'count') {
                icontext = self.keyMap[data.portal.options.guid].count;
            } else if (self.settings.displayMode === 'capsules') {
                let totalstext = [];
                if (self.keyMap[data.portal.options.guid].totaloutcapsules > 0) totalstext.push(self.keyMap[data.portal.options.guid].totaloutcapsules);
                if (self.keyMap[data.portal.options.guid].totalincapsules > 0) totalstext.push('(' + self.keyMap[data.portal.options.guid].totalincapsules + ')');
                icontext = totalstext.join(' ');
            }

            let icon;
            if (self.settings.displayMode === 'icon') {
                icon = self.keyIcon;
            } else {
                if (self.settings.selectedportalcapsulekeys && window.selectedPortal == data.portal.options.guid && self.keyMap[data.portal.options.guid].totalincapsules > 0) {
                    const countData = self.keyMap[data.portal.options.guid];
                    const capsuleNames = parseCapsuleNames(self.settings.capsuleNames);
                    let capsules = [];
                    for (let cnt = 0; cnt < countData.capsules.length; cnt++) {
                        let capsuleid = countData.capsules[cnt];
                        let capsulename = (capsuleNames[capsuleid] || capsuleid);
                        capsules.push(capsulename + ' (' + countData.capsuleCounts[capsuleid] + ')');
                    }
                    capsules.sort();
                    icontext += '<br>' + capsules.join('<br>');
                }

                icon = new L.DivIcon({
                    html: icontext,
                    className: 'plugin-live-inventory-count'
                });
            }

            data.portal._keyMarker = L.marker(data.portal._latlng, {
                icon: icon,
                interactive: false,
                keyboard: false,
                width: '35px'
            }).addTo(self.layerGroup);
        }
    }

    function removeKeyFromLayer(data) { // {portal: p, data: p.options.data }
        if (data.portal._keyMarker) {
            self.layerGroup.removeLayer(data.portal._keyMarker);
            delete data.portal._keyMarker;
        }
    }
    function showSelectedPortalCapsuleKeys(data) { // {selectedPortalGuid: guid, unselectedPortalGuid: oldPortalGuid}
        if (!self.settings.selectedportalcapsulekeys) return;
        if (data.unselectedPortalGuid && data.unselectedPortalGuid in window.portals) {
            removeKeyFromLayer({portal:window.portals[data.unselectedPortalGuid]});
            addKeyToLayer({portal:window.portals[data.unselectedPortalGuid]});
        }
        if (data.selectedPortalGuid && data.selectedPortalGuid in window.portals) {
            removeKeyFromLayer({portal:window.portals[data.selectedPortalGuid]});
            addKeyToLayer({portal:window.portals[data.selectedPortalGuid]});
        }
    }

    self.removeAllIcons = function() {
        self.layerGroup.clearLayers();
        for (let id in window.portals) {
            delete window.portals[id]._keyMarker;
        }
    };

    self.checkShowAllIcons = function() {
        const tileParams = window.getCurrentZoomTileParameters ? window.getCurrentZoomTileParameters() : window.getMapZoomTileParameters(window.getDataZoomForMapZoom(window.map.getZoom()));
        if (tileParams.level !== 0) {
            self.removeAllIcons();
        } else {
            for (let id in window.portals) {
                addKeyToLayer({
                    portal: window.portals[id]
                });
            }
        }
    };

    self.setupPortalsList = function() {
        if (!window.plugin.portalslist) return;

        let colpos = 0;
        for (colpos = 0; colpos < window.plugin.portalslist.fields.length; colpos++) { // find column Portal Name
            if (window.plugin.portalslist.fields[colpos].title == 'Portal Name') {
                break;
            }
        }
        if (colpos >= window.plugin.portalslist.fields.length) colpos = 0; // default first colum if column name not found

        // insert extra column at colpos:
        window.plugin.portalslist.fields.splice(colpos,0,{
            title: 'Keys',
            value: function(portal) { return self.keyGuidCount[portal.options.guid]; },
            sortValue: function(value, portal) { return (self.keyGuidCount[portal.options.guid] > 0 ? self.keyGuidCount[portal.options.guid] : 0); },
            format: function(cell, portal, value) {
                $(cell)
                    .addClass("alignR")
                    .append($('<span>')
                            .html(self.keyGuidCount[portal.options.guid] > 0 ? self.keyGuidCount[portal.options.guid] : '')
                           );
            },
            defaultOrder: -1 // descending
        });
    };

    self.setup = function() {
        self.layerGroup = new L.LayerGroup();
        window.addLayerGroup('Portal keys', self.layerGroup, false);
        createIcons();

        self.setupPortalsList();

        $('<a href="#">')
            .text('Inventory')
            .click(self.menu)
            .appendTo($('#toolbox'));

        window.pluginCreateHook('pluginLiveInventorySubscription'); // pluginCreateHook for IITC-me compatibility
        window.pluginCreateHook('pluginLiveInventoryUpdated'); // pluginCreateHook for IITC-me compatibility

        window.addHook('portalDetailsUpdated', portalDetailsUpdated);
        window.addHook('portalAdded', addKeyToLayer);
        window.addHook('portalRemoved', removeKeyFromLayer);
        window.addHook('portalSelected', showSelectedPortalCapsuleKeys);
        window.map.on('zoom', self.checkShowAllIcons);
        window.map.on('moveend', updateDistances);

        $("<style>")
            .prop("type", "text/css")
            .html(`.plugin-live-inventory-count {
font-size: 11px;
color: #ffff00;
font-family: monospace;
text-align: center;
text-shadow: 0 0 1px black, 0 0 1em black, 0 0 0.2em black;
pointer-events: none;
-webkit-text-size-adjust:none;
white-space: nowrap;
}
#live-inventory th {
background-color: rgb(27, 65, 94);
cursor: pointer;
position: sticky;
top: 0px;
}
#live-inventory table {
display: block;
overflow-y: auto;
}
#live-inventory-settings {
margin-top: 2em;
}
#live-inventory-settings h2{
line-height: 2em;
}
#randdetails td.randdetails-capsules {
white-space: normal;
}
#randdetails .randdetails-keys td,
#randdetails .randdetails-keys th {
vertical-align: top;
}
`)
            .appendTo("head");
        var sheet = document.createElement('style')
        sheet.innerHTML = '';
        sheet.innerHTML += '.' + self.id + 'author { margin-top: 14px; font-style: italic; font-size: smaller; }';
        document.body.appendChild(sheet);

        loadInventory();
        setTimeout(function() { refreshInventory(true); }, 1000); // delay setup and thus requesting data, or we might encounter a server error

        console.log('IITC plugin loaded: ' + self.title + ' version ' + self.version);
    };

    var setup = function() {
        (window.iitcLoaded?self.setup():window.addHook('iitcLoaded',self.setup));
    };

    setup.info = plugin_info; //add the script info data to the function as a property
    if(!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    // if IITC has already booted, immediately run the 'setup' function
    if(window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);
