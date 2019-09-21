

const zonesPerRegions = {
	"eu-central-1": ["a", "b"],
	"eu-west-1": ["a", "b", "c"],
	"eu-west-2": ["a", "b", "c"],
	"us-east-1": ["a", "b", "c", "d", "e"],
	"us-east-2": ["a", "b", "c"],
	"us-west-1": ["a", "b", "c"],
	"us-west-2": ["a", "b", "c"],
	"ap-southeast-1": ["a", "b", "c"],
	"ap-northeast-1": ["a", "b", "c"],
	"ap-southeast-2": ["a", "b"],
	"sa-east-1": ["a", "b"]
};

const compatibleInstanceTypes = ["g2.2xlarge", "g3s.xlarge", "g3.4xlarge"];
const compatibleInstanceTypesFilteringPerRegion = {
	"eu-west-2": {
		"g2.2xlarge": false
	}
};

module.exports = {
	zonesPerRegions: zonesPerRegions,
	compatibleInstanceTypes: compatibleInstanceTypes,
	compatibleInstanceTypesFilteringPerRegion: compatibleInstanceTypesFilteringPerRegion
};
