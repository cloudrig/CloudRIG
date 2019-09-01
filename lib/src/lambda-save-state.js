var AWS = require('aws-sdk');

exports.handler = (event, context, callback) => {

	console.log("Save state lambda triggered");
	console.log(event);
	console.log(context);

	const ec2 = new AWS.EC2();
	const ssm = new AWS.SSM();

	function waterfall(arr, cb) {
		function process(arr, cb, err, data) {
			if (err) { cb(err); return; }
			if (arr.length === 0) { cb(null, data); return; }
			var forwardArgs = [process.bind(null, arr, cb)];
			if (data) { forwardArgs.unshift(data) }
			arr.shift().apply(null, forwardArgs)
		}
		process(arr, cb)
	}

	function newImage() {
		var instanceId = event.detail["instance-id"];
		waterfall([
			function (cb) {
				console.log("Listing the instances managed by this stack spotfleet...");
				ec2.describeSpotFleetInstances({
					SpotFleetRequestId: instanceId,
				}, cb)
			},

			function (cb) {
				console.log("Checking if the instance " + instanceId + " is in this list...");
				var isInstanceInThisStack = false;
				for (var instance in cb.ActiveInstances) {
					if (instance.InstanceId === instanceId) {
						isInstanceInThisStack = true;
					}
				}

				if (isInstanceInThisStack) {
					cb();
				} else {
					console.log('Instance ' + instanceId + ' is not part of this stack. Ignoring...');
				}
			},

			function (cb) {
				console.log("Triggering the state save automation...");
				ssm.startAutomationExecution({
					DocumentName: process.env.CLOUDRIG_SAVE_STATE_AUTOMATION_DOCUMENT_NAME,
					Parameters: {
						InstanceId: instanceId,

					}
				}, cb)
			},



		], function (err, data) {
			if (err) { console.log(err); callback(err); }
			callback();
		});
	}
	waterfall([
		function (err, data) {
			if (err) { console.log(err); callback(err); }
			newImage();
		}
	])
};
