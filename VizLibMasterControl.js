'use strict';

var fs = require("fs"),
	dispatch = require("vizlib-hall-monitor"),
	events = require("vizlib-hall-monitor/enums/EventTypes"),
	storage = require("vizlib-storage-manager"),
	VizLibRequestFormat = require("vizlib-gfx-request"),
	ModuleLib = require('vizlib-module-library');

// variable instance for singleton action;
var instance;
var activeBuilders = { };




function VizLibMasterControl(accessParams) {
	var permissions = accessParams;
	var forYourReference = new VizLibRequestFormat();

	dispatch.addListener(events.FILE_DATA_STORED, handleFileData);
	dispatch.addListener(events.BCKGRND_GFX_STORED, handleBckgrndData);
	dispatch.addListener(events.BCKGRND_GFX_PLACED, handleBckgrndReady);
	dispatch.addListener(events.GFX_STORED_TO_DB, endBuildProcess);

	dispatch.addListener(events.FATAL_ERROR, endBuildProcess);
}

/*************************************/
/***** PRIVATE CONTROL FUNCTIONS *****/
/*************************************/
function handleFileData(payload) {
	var uid = payload.id;
	var builder = getBuilder(uid);

	builder.loadBackgroundGraphic(uid)
}

function handleBckgrndData(payload) {
	var uid = payload.id;
	var builder = getBuilder(uid);

	builder.setBackground(uid);
}

function handleBckgrndReady(payload) {
	var uid = payload.id;
	var builder = getBuilder(uid);

	builder.drawData(uid);
}


function endBuildProcess(payload) {
	var uid = payload.id;
	activeBuilders[uid] = undefined;

	if (!!payload.callback) {
		console.log("executing callback funciton from request.");
		payload.callback();
	}

}



function checkForPrereqGFX(reqObj, playGUID, gfxType) {
	// check to see if the prereq gfx is there

	var filepath; // TODO identify file and path of prereq
	fs.access(filepath, fs.F_OK, function(err) {
		if (!!err) {
			// to purgatory with you
			var id = reqObj.uid;
			dispatch.publish(id + events.MOVE_TO_PURGATORY, id);

			// TODO reinitiate the original gfx request after prereq complete
		} else {
			loadPrereqGFX(reqObj, filepath);
		}
	})
}

function loadPrereqGFX(reqObj, gfxPath) {
	// TODO retreive the required gfx from dynamo via storage manager
}


/*************************************/
/********** HELPER FUNCTIONS *********/
/*************************************/
function getBuilder(uid) {
	var builder = activeBuilders[uid];
	if (!!!builder) {
		// TODO throw an error;
		console.log("no builder for this id: " + uid);
	}

	return builder;
}


/*************************************/
/************ PUBLIC API *************/
/*************************************/

VizLibMasterControl.prototype = {
	handleGfxRequest: function(reqObj) {
		var uid = reqObj.uid;
		var builder = ModuleLib.getModule(reqObj.gfxType, uid);

		activeBuilders[uid] = builder;
		storage.addToQueue(reqObj);

		dispatch.publish(events.NEW_GFX_REQ, reqObj);
		builder.init(uid);


		/**
		 * DYNAMO PRECHECK might be obsolete via the API calls
		 * we may want in some cases to overwrite the graphic there.
		 */

		/**

		storage.precheckDynamo(reqObj)

			.then(function (itemExists) {
				var uid = reqObj.uid;
				var builder = ModuleLib.getModule(reqObj.gfxType, uid);

				activeBuilders[uid] = builder;
				storage.addToQueue(reqObj);

				dispatch.publish(events.NEW_GFX_REQ, reqObj);
				builder.init(uid);
			})
			.catch(function (err) {
				console.error('storage.precheckDynamo error: ' + JSON.stringify(err));
			});

		 */
	},

	fetchExtantGfx: function(reqObj) {

	}
};

function getInstance() {
	if (typeof instance === "undefined") {
		instance = new VizLibMasterControl();
	}

	return instance;
}

// attempt to make a proper singleton in the Node ecosystem
module.exports = (function() {
	return getInstance();
})();