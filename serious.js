var Model = require("./model");

var Serious = function () {
	// Defaults
	this.settings = {
		connection: { user: "root", password: "root" },
		logging: 1,
		client: require("./mysql"),
		primaryKey: "id"
	};
	this.online = false;
	return this;
};

Serious.prototype.set = function (setting, val) {
	this.settings[setting] = val;
	return this;
};

Serious.prototype.start = function (_cb) {
	var self = this
	  , counter = 0;

	this.client = new this.settings.client(this.settings.connection, this.settings.logging);
	
	this.client.createPool();

	this.client.listTables(function (err, tableNames) {
		if (err) return _cb(err);
		
		tableNames.forEach(function (tableName) {
			counter++;
			
			self[tableName] = new Model(tableName, self);
			self.client.listFields(tableName, function (err, fields) {
				self[tableName]._fields = fields;
				
				if (--counter) return;
				
				self.refreshAssociations();
				self.online = true;
				
				if (_cb) _cb();
			});
		});
	});
};

Serious.prototype.refreshAssociations = function () {
	for (var prop in this) {
		if (!this[prop].isModel || this[prop].isAlias) continue;
		
		for (var altProp in this) {
			if (!this[altProp].isModel) continue;

			this[prop].determineAssociation(this[altProp].tableName);
		}
	}
	return this;
};

Serious.prototype.query = function () {
	var args = Array.prototype.slice.call(arguments)
	  , sql
	  , params = []
	  , _cb;
	
	sql = args.shift();
	
	if (typeof args[args.length - 1] === "function") {
		_cb = args.pop();
	}
	
	if (args.length == 1) {
		params = args[0];
	} else {
		params = args;
	}
	
	this.client.run(sql, params, _cb);
	return this;
};

module.exports = Serious;