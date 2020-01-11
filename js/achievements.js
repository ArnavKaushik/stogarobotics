/**
 * @file Script that runs on the Achievements page. Queries data from the VexDB API and counts certain attributes to present team totals.
 */

import {qs, qsa, createElement, declade} from "./util.js";
import {teamNumbers, vexdbGet, vexdbGetForTeams, createNotice, ResultObjectRecordCollector, groomAwardName, scopeNames, generateInstanceDetails} from "./app-util.js";
import {LoadingSign} from "./ce/LoadingSign.js";

const instanceDisplay = qs("instance-display");

// Classes used to count instances of a type from the query

/**
 * @class Contains a counter, along with several common properties among counters on the Achievements page.
 */
class RecordCollectorWrapper {
    constructor({counter, endpointName, displayElementName, sortRecords, generateBlockLabel, buildInstancesDisplay}={}) {
        this.counter = counter;
        this.endpointName = endpointName;
        this.grid = qs(`block-grid[name="${displayElementName}"]`);
        this.nLoadingFails = 0;

        this.sortRecords = sortRecords;
        this.generateBlockLabel = generateBlockLabel;
        this.buildInstancesDisplay = buildInstancesDisplay;

        this.constructor.mapFromCounters.set(counter, this);
    }

    getLoadingFailMessage() {
        switch (true) {
            case this.nLoadingFails === 1:
                return "";
    
            case this.nLoadingFails === 2:
                return " again";
    
            default:
                return ` ${this.nLoadingFails} times`;
        }
    }

    updateDisplay() {
        declade(this.grid);

        this.counter.records = this.sortRecords(this.counter);

        // Display the counts
        for (const record of this.counter.records) {
            createBlock(record.count, this.generateBlockLabel(record), this.grid, false, record);
        }
    
        const nTotal = this.counter.records.reduce((accumulator, {count}) => accumulator + count, 0);
        createBlock(nTotal, "Total", this.grid, true, this);
    }

    async count(teamNumbersTarget) {
        // Query VexDB
        const resultObjects = (await vexdbGetForTeams(this.endpointName, teamNumbersTarget, {}, true)).flat();
    
        this.counter.count(resultObjects);
    
        // Show the list of categories
        this.updateDisplay();
    }
    
    async displayCategoryInstances(instances) {
        declade(instanceDisplay);
        if (instances.length === 0) {
            instanceDisplay.appendChild(createNotice("no instances fit this category"));
            return;
        }

        // Sort the instances into teams
        const instancesByTeam = countCategoryInstancesByTeam(instances);
        const instancesByTeamEntries = Object.entries(instancesByTeam).sort((a, b) => a[0].localeCompare(b[0]));
    
        for (const [teamNumber, instances] of instancesByTeamEntries) {
            // Create a section for each team
    
            createElement("h3", {
                children: [
                    createElement("a", {
                        properties: {
                            href: `../teams/${teamNumber}/`,
                        },
    
                        textContent: teamNumber,
                    }),
                ],
    
                parent: instanceDisplay,
            });
    
            createElement("instance-subcounter", {
                textContent: instances.length,
    
                parent: instanceDisplay,
            });
    
            const list = createElement("instance-list", {
                parent: instanceDisplay,
            });
    
            // Since the number of instances to display is known, placeholder elements can be used to fill the space and avoid page jumping
            for (let i = 0; i < instances.length; i++) {
                createElement("instance-details", {
                    children: [
                        createNotice("loading"),
                    ],
    
                    classes: ["placeholder"],
    
                    parent: list,
                });
            }
    
            this.buildInstancesDisplay(instances, list);
        }
    }
}
RecordCollectorWrapper.mapFromCounters = new WeakMap();

const eventScopeWrapper = new RecordCollectorWrapper({
    counter: ResultObjectRecordCollector.generateCommon.eventsByScope(),

    endpointName: "events",
    displayElementName: "events",

    sortRecords(counter) {
        return counter.records.sort((a, b) => scopeNames.indexOf(a.data.scope) - scopeNames.indexOf(b.data.scope));
    },

    generateBlockLabel(record) {
        return record.data.scope ? `${record.data.scope} appearances` : "Other";
    },
    
    buildInstancesDisplay(instances, list) {
        instances = instances.sort((a, b) => new Date(b.start) - new Date(a.start));
        for (let i = 0; i < instances.length; i++) {
            const instance = instances[i];
            const instanceDetailsContainer = list.children[i];

            generateInstanceDetails.event(instance, instanceDetailsContainer);
        }
    },
});

const awardsWrapper = new RecordCollectorWrapper({
    counter: ResultObjectRecordCollector.generateCommon.awards(),

    endpointName: "awards",
    displayElementName: "awards",

    sortRecords(counter) {
        return counter.records.sort((a, b) => a.data.order - b.data.order);
    },

    generateBlockLabel(record) {
        return groomAwardName(record.data.name);
    },
    
    buildInstancesDisplay(instances, list) {
        for (let i = 0; i < instances.length; i++) {
            const instance = instances[i];
            const instanceDetailsContainer = list.children[i];

            (async () => {
                const event = await findEvent(instance.sku);
                generateInstanceDetails.award(instance, instanceDetailsContainer, event);
            })();

        }
    },
});

async function findEvent(sku) {
    for (const instance of eventScopeWrapper.counter.records.map(record => record.instances).flat()) {
        if (instance.sku === sku) {
            return instance;
        }
    }

    return (await vexdbGet("events", {sku})).result[0];
}


// Run a counter


let nBlock = 0; // numerical id, used to match up each block with its <input>
// Create a box displaying a number with a label
function createBlock(number, label, parent, emphasize=false, counterWrapper) {
    const classes = ["button", "item"];

    if (emphasize) {
        classes.push("em");
    }

    const id = `stat-viewer-control_${nBlock}`;

    const input = createElement("input", {
        properties: {
            name: "stat-viewer-control",
            type: "radio",
            id,
        },

        parent,
    });
    
    inputsToRecords.set(input, counterWrapper);

    createElement("label", {
        attributes: [
            ["for", id],
        ],

        classes,

        children: [
            createElement("big-number", {
                textContent: number,
            }),
            createElement("h4", {
                textContent: label,
            }),
        ],

        parent,
    });

    nBlock++;
}

// Divide an instances array into arrays for each team
function countCategoryInstancesByTeam(instances) {
    const instancesByTeam = {};

    for (const instance of instances) {
        if (!instancesByTeam[instance.team]) {
            instancesByTeam[instance.team] = [];
        }

        instancesByTeam[instance.team].push(instance);
    }

    return instancesByTeam;
}

function instanceDisplayInit() {
    declade(instanceDisplay).appendChild(createNotice("Select a statistic to view its instances…"));
}

// init

const filterRows = qs("filter-rows");

const recordForm = qs("form.stat-options");
function selectedRecord() {
    return qs("input:checked", recordForm);
}

const inputsToRecords = new WeakMap();
// When a record gets selected...
recordForm.addEventListener("change", () => {
    const record = inputsToRecords.get(selectedRecord());

    if (!record) { // No record selected
        instanceDisplayInit();
    } else if (record instanceof RecordCollectorWrapper) { // "Total" record selected
        const counterWrapper = record;

        const instances = counterWrapper.counter.instances();
        counterWrapper.displayCategoryInstances(instances);
    } else { // Individual record selected
        const instances = record.instances;
        RecordCollectorWrapper.mapFromCounters.get(record.counter).displayCategoryInstances(instances);
    }
});

let querying = false;
function query() {
    if (querying) return;

    instanceDisplayInit();

    const record = selectedRecord();
    if (record) {
        record.checked = false;
    }

    filterRows.classList.add("disabled");
    querying = true;

    const teamNumbersTarget = [...qsa("input[name='team-filter']:checked", filterRows)].map(input => input.value);

    const statusPromises = [];

    for (const counterWrapper of [eventScopeWrapper, awardsWrapper]) {
        counterWrapper.counter.clear();

        // Select all teams if no filters are selected
        const asyncCallback = () => counterWrapper.count(teamNumbersTarget.length !== 0 ? teamNumbersTarget : teamNumbers);

        const loadingSign = LoadingSign.create(asyncCallback);
        declade(counterWrapper.grid).parentElement.insertBefore(loadingSign, counterWrapper.grid);

        statusPromises.push(new Promise(resolve => {
            loadingSign.run().then(() => {
                loadingSign.remove();
            }).finally(resolve); // `finally` so that the status promises resolve even when loading fails
        }));
    }

    Promise.all(statusPromises).then(() => {
        filterRows.classList.remove("disabled");
        querying = false;
    });
}

filterRows.addEventListener("change", () => {
    query();
});

query();