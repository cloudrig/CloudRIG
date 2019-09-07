var AWS = require('aws-sdk');
var waterfall = require('async-waterfall');

exports.handler = (event, context, callback) => {

	console.log("Save state lambda triggered");
	console.log('Event: ' + JSON.stringify(event));
	console.log('Context: ' + JSON.stringify(context));

	const ec2 = new AWS.EC2();
	const ssm = new AWS.SSM();

	const instanceId = event.detail["instance-id"];
	console.log("Handling stop event for instance: " + instanceId);

	waterfall([
			function (cb) {
				console.log("Listing the instances managed by this stack spotfleet " + process.env.CLOUDRIG_SPOTFLEET_REQUEST_ID + "...");
				ec2.describeSpotFleetInstances({
					SpotFleetRequestId: process.env.CLOUDRIG_SPOTFLEET_REQUEST_ID,
				}, cb)
			},

			function (data, cb) {
				console.log("Checking if the instance " + instanceId + " is in this list...");
				var isInstanceInThisStack = false;
				for (const instance of data['ActiveInstances']) {
					if (instance['InstanceId'] === instanceId) {
						isInstanceInThisStack = true;
					}
				}

				if (isInstanceInThisStack) {
					cb();
				} else {
					console.log('Instance ' + instanceId + ' is not part of this stack. Ignoring...');
				}
			},

			function (data, cb) {
				console.log("Triggering the state save automation...");
				ssm.startAutomationExecution({
					'DocumentName': process.env.CLOUDRIG_SAVE_STATE_AUTOMATION_DOCUMENT_NAME,
					'Parameters': {
						'InstanceId': [instanceId],
					}
				}, cb);
			}
		],
		// CATCH ERRORS
		function(error, data) {
			if (error) {
				console.log('Error while executing: ' + error); callback(error);
			} else {
				console.log('Done starting the save state automation');
				callback(null, data);
			}
		})
};
