// ==UserScript==
// @author         EisFrei - fork by DanielOnDiordna
// @name           IITC plugin: Live Inventory
// @category       Info
// @version        0.0.12.20210313.211400
// @homepageURL    https://github.com/EisFrei/IngressLiveInventory
// @updateURL      https://softspot.nl/ingress/plugins/iitc-plugin-liveInventory.meta.js
// @downloadURL    https://softspot.nl/ingress/plugins/iitc-plugin-liveInventory.user.js
// @description    [EisFrei-0.0.12.20210313.211400] Show current ingame inventory. Requires CORE subscription (Fork by DanielOnDiordna https://github.com/DanielOndiordna/IngressLiveInventory)
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
    self.version = '0.0.12.20210313.211400';
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
`;
    self.namespace = 'window.plugin.' + self.id + '.';
    self.pluginname = 'plugin-' + self.id;

    self.lastmenu = undefined;
    self.lastsortitems = 'type';
    self.lastsortitemsdirection = 1;
    self.lastsortkeys = 'name';
    self.lastsortkeysdirection = 1;

    self.keyCount = [];
    self.itemCount = [];
    self.keyGuidCount = {};
    self.keyIcon = '';

    const KEY_SETTINGS = "plugin-live-inventory";
    self.settings = {
        displayMode: 'icon',
        capsuleNames: '',
    };

    const translations = {
        BOOSTED_POWER_CUBE: 'Hypercube',
        CAPSULE: 'Capsule',
        DRONE: 'Drone',
        EMITTER_A: 'Resonator',
        EMP_BURSTER: 'XMP',
        EXTRA_SHIELD: 'Aegis Shield',
        FLIP_CARD: 'Virus',
        FORCE_AMP: 'Force Amp',
        HEATSINK: 'HS',
        INTEREST_CAPSULE: 'Quantum Capsule',
        KEY_CAPSULE: 'Key Capsule',
        KINETIC_CAPSULE: 'Kinetic Capsule',
        LINK_AMPLIFIER: 'LA',
        MEDIA: 'Media',
        MULTIHACK: 'Multi-Hack',
        PLAYER_POWERUP: 'Apex',
        PORTAL_LINK_KEY: 'Key',
        PORTAL_POWERUP: 'Fracker',
        POWER_CUBE: 'PC',
        RES_SHIELD: 'Shield',
        TRANSMUTER_ATTACK: 'ITO -',
        TRANSMUTER_DEFENSE: 'ITO +',
        TURRET: 'Turret',
        ULTRA_LINK_AMP: 'Ultra-Link',
        ULTRA_STRIKE: 'US',
    };

    function checkSubscription(callback) {
        var versionStr = niantic_params.CURRENT_VERSION;
        var post_data = JSON.stringify({
            v: versionStr
        });

        var result = $.ajax({
            url: '/r/getHasActiveSubscription',
            type: 'POST',
            data: post_data,
            context: {},
            dataType: 'json',
            success: [(data) => callback(null, data)],
            error: [(data) => callback(data)],
            contentType: 'application/json; charset=utf-8',
            beforeSend: function (req) {
                req.setRequestHeader('accept', '*/*');
                req.setRequestHeader('X-CSRFToken', readCookie('csrftoken'));
            }
        });
        return result;
    }


    function addItemToCount(item, countMap, incBy) {
        if (item[2] && item[2].resource && item[2].timedPowerupResource) {
            const key = `${item[2].resource.resourceType} ${item[2].timedPowerupResource.designation}`;
            if (!countMap[key]) {
                countMap[key] = item[2].resource;
                countMap[key].count = 0;
                countMap[key].type = `Powerup ${translations[item[2].timedPowerupResource.designation] || item[2].timedPowerupResource.designation}`;
            }
            countMap[key].count += incBy;
        } else if (item[2] && item[2].resource && item[2].flipCard) {
            const key = `${item[2].resource.resourceType} ${item[2].flipCard.flipCardType}`;
            if (!countMap[key]) {
                countMap[key] = item[2].resource;
                countMap[key].count = 0;
                countMap[key].type = `${translations[item[2].resource.resourceType]} ${item[2].flipCard.flipCardType}`;
            }
            countMap[key].flipCardType = item[2].flipCard.flipCardType;
            countMap[key].count += incBy;
        } else if (item[2] && item[2].resource) {
            const key = `${item[2].resource.resourceType} ${item[2].resource.resourceRarity}`;
            if (!countMap[key]) {
                countMap[key] = item[2].resource;
                countMap[key].count = 0;
                countMap[key].type = `${translations[item[2].resource.resourceType]}`;
            }
            countMap[key].count += incBy;
        } else if (item[2] && item[2].resourceWithLevels) {
            const key = `${item[2].resourceWithLevels.resourceType} ${item[2].resourceWithLevels.level}`;
            if (!countMap[key]) {
                countMap[key] = item[2].resourceWithLevels;
                countMap[key].count = 0;
                countMap[key].resourceRarity = 'COMMON';
                countMap[key].type = `${translations[item[2].resourceWithLevels.resourceType]} ${item[2].resourceWithLevels.level}`;
            }
            countMap[key].count += incBy;
        } else if (item[2] && item[2].modResource) {
            const key = `${item[2].modResource.resourceType} ${item[2].modResource.rarity}`;
            if (!countMap[key]) {
                countMap[key] = item[2].modResource;
                countMap[key].count = 0;
                countMap[key].type = `${translations[item[2].modResource.resourceType]}`;
                countMap[key].resourceRarity = countMap[key].rarity;
            }
            countMap[key].count += incBy;
        } else {
            console.log(item);
        }
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

    function prepareItemCounts(data) {
        if (!data || !data.result) {
            return [];
        }
        const countMap = {};
        data.result.forEach((item) => {
            addItemToCount(item, countMap, 1);
            if (item[2].container) {
                item[2].container.stackableItems.forEach((item) => {
                    addItemToCount(item.exampleGameEntity, countMap, item.itemGuids.length);
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
            }

            if (moniker && countMap[key].capsules.indexOf(moniker) === -1) {
                countMap[key].capsules.push(moniker);
            }

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

    function getKeyTableBody(orderBy, direction) {
        self.lastsortkeys = orderBy;
        self.lastsortkeysdirection = direction;

        const capsuleNames = parseCapsuleNames(self.settings.capsuleNames);

        const sortFunctions = {
            name: (a, b) => {
                if (a.portalCoupler.portalTitle === b.portalCoupler.portalTitle) {
                    return 0;
                }
                return (a.portalCoupler.portalTitle.toLowerCase() > b.portalCoupler.portalTitle.toLowerCase() ? 1 : -1) * (direction ? 1 : -1);
            },
            count: (a, b) => (a.count - b.count) * (direction ? 1 : -1),
            distance: (a, b) => (a._distance - b._distance) * (direction ? 1 : -1),
            capsule: (a, b) => {
                const sA = a.capsules.join(', ').toLowerCase();
                const sB = b.capsules.join(', ').toLowerCase();
                if (sA === sB) {
                    return 0;
                }
                return (sA > sB ? 1 : -1) * (direction ? 1 : -1);
            }
        }

        self.keyCount.sort(sortFunctions[orderBy]);
        return self.keyCount.map((el) => {
            return `<tr>
<td align="right">${el.count}</td>
<td><a href="//intel.ingress.com/?pll=${el._latlng.lat},${el._latlng.lng}" onclick="zoomToAndShowPortal('${el.portalCoupler.portalGuid}',[${el._latlng.lat},${el._latlng.lng}]); return false;">${el.portalCoupler.portalTitle}</a></td>
<td align="right">${el._formattedDistance}</td>
<td>${el.capsules.map(e => capsuleNames[e] || e).join(', ')}</td>
</tr>`;
        }).join('');
    }

    function updateKeyTableBody(orderBy, direction) {
        $('#live-inventory-key-table tbody').empty().append($(getKeyTableBody(orderBy, direction)))
    }


    function getItemTableBody(orderBy, direction) {
        self.lastsortitems = orderBy;
        self.lastsortitemsdirection = direction;

        const sortFunctions = {
            type: (a, b) => {
                if (a.type === b.type) {
                    return 0;
                }
                return (a.type.toLowerCase() > b.type.toLowerCase() ? 1 : -1) * (direction ? 1 : -1);
            },
            rarity: (a, b) => {
                if (a.resourceRarity === b.resourceRarity) {
                    return 0;
                }
                return (a.resourceRarity.toLowerCase() > b.resourceRarity.toLowerCase() ? 1 : -1) * (direction ? 1 : -1);
            },
            count: (a, b) => (a.count - b.count) * (direction ? 1 : -1),
        };

        self.itemCount.sort(sortFunctions[orderBy]);
        return self.itemCount.map((el) => {
            return `<tr>
<td align="right">${el.count}</td>
<td>${el.type}</td>
<td>${el.resourceRarity || ''}</td>
</tr>`;
        }).join('');
    }

    function updateItemTableBody(orderBy, direction) {
        $('#live-inventory-item-table tbody').empty().append($(getItemTableBody(orderBy, direction)))
    }

    function exportItems() {
        const str = ['Type\tRarity\tCount', ...self.itemCount.map((i) => [i.type, i.resourceRarity, i.count].join('\t'))].join('\n');
        navigator.clipboard.writeText(str);
        alert('Items are copied to your clipboard');
    }

    function exportKeys() {
        const capsuleNames = parseCapsuleNames(self.settings.capsuleNames);
        const str = ['Name\tLink\tGUID\tKeys\tCapsules', ...self.keyCount.map((el) => [el.portalCoupler.portalTitle, `https//intel.ingress.com/?pll=${el._latlng.lat},${el._latlng.lng}`, el.portalCoupler.portalGuid, el.count, el.capsules.map(e => capsuleNames[e] || e).join(',')].join('\t'))].join('\n');
        navigator.clipboard.writeText(str);
        alert('Keys are copied to your clipboard');
    }

    self.menu = function(submenu) {
        if (typeof submenu != 'string') submenu = self.lastmenu;
        self.lastmenu = submenu;

        var html = `<input type="button" onclick="${self.namespace}menu('Items')" value="Items">
<input type="button" onclick="${self.namespace}menu('Keys')" value="Keys">
<input type="button" onclick="${self.namespace}menu('Settings')" value="Settings"><br />`

        if (!submenu || submenu == 'Items') {
            submenu = 'Items';
            html += `<div id="live-inventory">
<div id="live-inventory-tables">
<table id="live-inventory-item-table">
<thead>
<tr>
<th class="" data-orderby="count">Count</th>
<th class="" data-orderby="type">Type</th>
<th class="" data-orderby="rarity">Rarity</th>
</tr>
</thead>
<tbody>
${getItemTableBody(self.lastsortitems, self.lastsortitemsdirection)}
</tbody>
</table>
</div>
</div>`;
        } else if (submenu == 'Keys') {
            html += `<div id="live-inventory">
<table id="live-inventory-key-table">
<thead>
<tr>
<th class="" data-orderby="count">Count</th>
<th class="" data-orderby="name">Portal</th>
<th class="" data-orderby="distance">Distance</th>
<th class="" data-orderby="capsule">Capsules</th>
</tr>
</thead>
<tbody>
${getKeyTableBody(self.lastsortkeys, self.lastsortkeysdirection)}
</tbody>
</table>
</div>`;
        } else if (submenu == 'Settings') {
            html += `<div id="live-inventory-settings">
<h2>Settings</h2>
Display mode:<br />
<select id="live-inventory-settings--mode" onchange="${self.namespace}settings.displayMode = this.value; ${self.namespace}saveSettings(); ${self.namespace}removeAllIcons(); ${self.namespace}checkShowAllIcons();">
<option value="icon"${self.settings.displayMode == 'icon'?' selected':''}>Key icon</option>
<option value="count"${self.settings.displayMode == 'count'?' selected':''}>Number of keys</option>
</select>
<h3>Capsule names</h3>
<textarea id="live-inventory-settings--capsule-names" placeholder="CAPSULEID:Display name">${self.settings.capsuleNames || ''}</textarea><br />
Formatting (one on each row): CAPSULEID:Display name<br />
<input type="button" onclick="${self.namespace}settings.capsuleNames = $('#live-inventory-settings--capsule-names').val(); ${self.namespace}saveSettings()" value="Save names">
</div>`;
        }

        dialog({
            html: html,
            title: self.title + ' - ' + submenu,
            id: 'live-inventory',
            width: 'auto'
        }).dialog('option', 'buttons', {
            'Refresh': loadInventory,
            'Copy Items': exportItems,
            'Copy Keys': exportKeys,
            'Close': function () {
                $(this).dialog('close');
            },
        });

        $('#live-inventory-item-table th').click(function () {
            const orderBy = this.getAttribute('data-orderby');
            this.orderDirection = !this.orderDirection;
            updateItemTableBody(orderBy, this.orderDirection);
        });
        $('#live-inventory-key-table th').click(function () {
            const orderBy = this.getAttribute('data-orderby');
            this.orderDirection = !this.orderDirection;
            updateKeyTableBody(orderBy, this.orderDirection);
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

    function prepareData(data) {
        self.itemCount = prepareItemCounts(data);
        self.keyCount = prepareKeyCounts(data);
        self.keyMap = preparePortalKeyMap();

        for (let cnt=0; cnt < self.keyCount.length; cnt++) {
            self.keyGuidCount[self.keyCount[cnt].portalCoupler.portalGuid]=self.keyCount[cnt].count;
        }

        updateDistances();
        if ($('#live-inventory-key-table th').length > 0 || $('#live-inventory-item-table th').length > 0) self.menu();
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

    function loadInventory(silent) {
        try {
            let localData = localStorage[KEY_SETTINGS];
            if (localData && localData != "") {
                localData = JSON.parse(localData);
            }
            if (localData && localData.settings) {
                self.settings = localData.settings;
            }
            if (localData && localData.expires > Date.now() && localData.data) {
                prepareData(localData.data);
                if (silent === true)
                    console.log(self.title + ' - Inventory was recently updated, wait ' + nicetimestring(localData.expires - Date.now()));
                else
                    alert('Inventory was recently updated, wait ' + nicetimestring(localData.expires - Date.now()));
                return;
            }
        } catch (e) {
            console.log('loadInventory error',e);
        }

        console.log(self.title + ' - Updating inventory');
        checkSubscription((err, data) => {
            if (data && data.result === true) {
                window.postAjax('getInventory', {
                    "lastQueryTimestamp": 0
                }, (data, textStatus, jqXHR) => {
                    localStorage[KEY_SETTINGS] = JSON.stringify({
                        data: data,
                        expires: Date.now() + 10 * 60 * 1000, // request data only once per five minutes, or we might hit a rate limit
                        settings: self.settings
                    });
                    prepareData(data);
                }, (data, textStatus, jqXHR) => {
                    console.error(data);
                });
            }
        });
    };

    self.saveSettings = function() {
        const ls = {};
        try {
            const localData = JSON.parse(localStorage[KEY_SETTINGS]);
            ls.data = localData.data;
            ls.expires = localData.expires;
        } catch (e) {}
        ls.settings = self.settings;
        localStorage[KEY_SETTINGS] = JSON.stringify(ls);
    };

    function portalDetailsUpdated(p) {
        if (!self.keyMap) {
            return;
        }
        const capsuleNames = parseCapsuleNames(self.settings.capsuleNames);
        const countData = self.keyMap[p.guid];
        if (countData) {
            $(`<tr class="randdetails-keys"><td>${countData.count}</td><th>Keys</th><th>Capsules</th><td class="randdetails-capsules">${countData.capsules.map(e => capsuleNames[e] || e).join(', ')}</td></tr>`)
                .appendTo($('#randdetails tbody'));
        }
    }

    function addKeyToLayer(data) {
        const tileParams = window.getCurrentZoomTileParameters ? window.getCurrentZoomTileParameters() : window.getMapZoomTileParameters();
        if (tileParams.level !== 0) {
            return;
        }

        if (self.keyMap && self.keyMap[data.portal.options.guid] && !data.portal._keyMarker) {
            let icon = self.keyIcon;
            if (self.settings.displayMode === 'count') {
                icon = new L.DivIcon({
                    html: self.keyMap[data.portal.options.guid].count,
                    className: 'plugin-live-inventory-count'
                });
            }
            data.portal._keyMarker = L.marker(data.portal._latlng, {
                icon: icon,
                interactive: false,
                keyboard: false,
            }).addTo(self.layerGroup);
        }
    }

    function removeKeyFromLayer(data) {
        if (data.portal._keyMarker) {
            self.layerGroup.removeLayer(data.portal._keyMarker);
            delete data.portal._keyMarker;
        }
    }

    self.removeAllIcons = function() {
        self.layerGroup.clearLayers();
        for (let id in window.portals) {
            delete window.portals[id]._keyMarker;
        }
    };

    self.checkShowAllIcons = function() {
        const tileParams = window.getCurrentZoomTileParameters ? window.getCurrentZoomTileParameters() : window.getMapZoomTileParameters();
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

    self.prepareInventory = function() {
        loadInventory(true);
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

        window.addHook('portalDetailsUpdated', portalDetailsUpdated);
        window.addHook('portalAdded', addKeyToLayer);
        window.addHook('portalRemoved', removeKeyFromLayer);
        window.map.on('zoom', self.checkShowAllIcons);
        window.map.on('moveend', updateDistances);

        $("<style>")
            .prop("type", "text/css")
            .html(`.plugin-live-inventory-count {
font-size: 10px;
color: #FFFFBB;
font-family: monospace;
text-align: center;
text-shadow: 0 0 1px black, 0 0 1em black, 0 0 0.2em black;
pointer-events: none;
-webkit-text-size-adjust:none;
}
#live-inventory th {
background-color: rgb(27, 65, 94);
cursor: pointer;
}
#live-inventory-settings {
margin-top: 2em;
}
#live-inventory-settings h2{
line-height: 2em;
}
#live-inventory-settings--capsule-names{
min-height: 200px;
min-width: 400px;
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

        setTimeout(self.prepareInventory, 1000); // delay setup and thus requesting data, or we might encounter a server error

        console.log('IITC plugin loaded: ' + self.title + ' version ' + self.version);
    };

    var setup = function() {
        window.addHook('iitcLoaded',self.setup);
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
