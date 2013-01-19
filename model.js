var lingo = require("lingo")
  , Find = require("./find");

var Model = function (tableName, db) {
	this.tableName = tableName;
	this.foreignKey = db.settings.foreignKey(tableName);
	this.db = db;
	this.client = db.client;
	this.isModel = true;
	this.associations = {};
	return this;
};

Model.prototype.getPrimaryKey = function () {
	if (this.isAlias) return this.db[this.aliasOf].getPrimaryKey();
	if (this.primaryKey) return this.primaryKey;
	for (var prop in this._fields) {
		if (this._fields[prop].Key === "PRI") return prop;
	}
	return this.db.settings.primaryKey;
};

Model.prototype.getFields = function () {
	var fields = [];
	for (var prop in this._fields) {
		if (this._fields.hasOwnProperty(prop)) fields.push(prop);
	}
	return fields;
};


Model.prototype.determineAssociation = function (str) {
	
	// Aliases contain no associations...
	if (this.isAlias) return this.db[this.aliasOf].determineAssociation(str);
	
	var assoc = this.associations[str];
	
	// Check if table exists
	if (!this.db[str]) return null;
	
	// Check if assoc already determined
	switch (assoc) {
	case "hasOne":
	case "belongsTo":
	case "hasMany":
	case "paired":
	case "polymorphic":
		return { type: assoc };
	}
	if (assoc && assoc.type) {
		// And alternate form
		switch (assoc.type) {
		case "hasOne":
		case "belongsTo":
		case "hasMany":
		case "paired":
		case "polymorphic":
		case "contraPolymorphic":
			// Kill object references.
			return JSON.parse(JSON.stringify(assoc));
		}
	}
	
	// Check for belongsTo
	if (this._fields[this.db[str].foreignKey]) {
		return { type: this.associations[str] = "belongsTo" };
	}
	
	// Aliases only belongsTo or hABTM
	if (!this.db[str].isAlias) {
		
		// Check for hasMany/hasOne
		if (this.db[str]._fields[this.foreignKey]) {
			return { type: this.associations[str] = "hasMany" };
		}
		
	}

	// Check for hABTM table
	var connectorModels = this.db.settings.connectorModel(str, this.tableName);
	if (!Array.isArray(connectorModels)) connectorModels = [connectorModels];
	for (var i = 0, len = connectorModels.length; i < len; i++) {
		if (!this.db[connectorModels[i]]) continue;
		
		return this.associations[str] = { type: "hasMany", through: connectorModels[i] };
	}
	
	return null;
};

Model.prototype.setAlias = function () {
	var self = this
	  , aliases = Array.prototype.slice.call(arguments);
	aliases.forEach(function (alias) {
		self.db[alias] = new Model(alias, self.db);
		self.db[alias].isAlias = true;
		self.db[alias].aliasOf = self.tableName;
	});
	self.db.refreshAssociations();
	return this;
};

Model.prototype.addMethod = function (name, foo) {
	this[name] = foo;
	return this;
};

Model.prototype.addInstanceMethod = function (name, foo) {
	this.instanceMethods[name] = foo;
	return this;
};

Model.prototype.instanceMethods = {
	fetch: function () {
		var args = Array.prototype.slice.call(arguments)
		  , self = this
		  , counter = 0
		  , _cb;
		
		if (typeof args[args.length - 1] === "function") _cb = args.pop();
		
		args.forEach(function (arg) {
			counter++;
			self._model.fetchAssociation(self, arg, function (err) {
				if (!_cb) return;	
				if (err) return _cb(err);
				if (!--counter) _cb(null, self);
			});
		});
		return this;
	},
	set: function (table, _cb) {
		if (_cb) _cb("Setting associations isn't supported yet.");
		return this;
	},
	delete: function (_cb) {
		var c = {}
		  , primaryKey = this._model.getPrimaryKey();
		if (Array.isArray(this)) {
			c[primaryKey] = this.map(function (row) { return row[primaryKey]; });
		} else {
			c[primaryKey] = this[primaryKey];
		}
		this._model.where(c).deleteAll(_cb);
		return this;
	},
	_toJSON: function () {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(this);
		return JSON.stringify.apply(JSON, args);
	},
	update: function (objArg, _cb) {
		var primaryKey = this._model.getPrimaryKey()
		  , fields = this._model.getFields()
		  , obj = {}
		  , c = {};
		
		for (var prop in objArg) {	
			if (!objArg.hasOwnProperty(prop)) continue;
			if(!~fields.indexOf(prop)) continue;
			obj[prop] = objArg[prop];
		}
		
		if (Array.isArray(this)) {
			c[primaryKey] = [];
			this.forEach(function (row) {
				for (var prop in obj) {
					if (!obj.hasOwnProperty(prop)) continue;
					row[prop] = obj[prop];
				}
				c[primaryKey].push(row[primaryKey]);
			});
		} else {
			for (var prop in obj) {
				if (!obj.hasOwnProperty(prop)) continue;
				this[prop] = obj[prop];
			}

			c[primaryKey] = this[primaryKey];
		}
		this._model.where(c).set(obj).updateAll(_cb);
	},
	save: function (_cb) {
		this._model.save(this, _cb);
		return this;
	}
};

Model.prototype._addInstanceMethods = function (rows) {
	var self = this
	  , primaryKey = this.getPrimaryKey();
	
	function addEm(rows) {
		Object.defineProperty(rows, "_model", { value: self });
		
		var obj = {};
		for (var prop in self.instanceMethods) {
			if (!self.instanceMethods.hasOwnProperty(prop)) continue;
			
			obj[prop] = { value: self.instanceMethods[prop] };
		}
		Object.defineProperties(rows, obj);
	}
	addEm(rows);
	if (Array.isArray(rows)) rows.forEach(addEm);
	
	return rows;
};

Model.prototype.add = function (inserts, _cb) {
	var self = this
	  , fields = []
	  , filteredInserts = []
	  , params = []
	  , i = 0;
	
	if (!Array.isArray(inserts)) inserts = [inserts];
	
	inserts.forEach(function (insert) {		
		filteredInserts[i++] = {}
		
		for (var prop in insert) {
			if (!self._fields.hasOwnProperty(prop)) continue;
			
			filteredInserts[i++][prop] = "?";
			params.push(insert[prop]);
		}
	});
	
	this.client.insert(this.tableName, filteredInserts, params, _cb);
};

Model.prototype.through = function (model) {
	return { model: this.tableName, through: model.tableName || model };
};

Model.prototype.via = Model.prototype.through;

Model.prototype.hasMany = function () {
	var self = this
	  , tables = Array.prototype.slice.call(arguments);
	
	tables.forEach(function (table) {
		var table
		  , through
		  , regex = /((.)*)(\s+(through|via)\s+)((.)*)/gi;
		
		if (typeof table === "string") {
			var matches = regex.exec(table);
			if (matches) {
				table = matches[1];
				through = matches[5];
			}
		} else if (table.isModel) {
			table = table.tableName;
		} else if (table.through) {
			through = table.through;
			table = table.model;
		} else {
			return;
		}
		
		if (!through) return self.associations[table] = "hasMany";
		
		self.associations[table] = { type: "hasMany", through: through };
	});
	
	return this;
};

Model.prototype.belongsTo = function () {
	var self = this
	  , tables = Array.prototype.slice.call(arguments);

	tables.forEach(function (table) {
		if (table.isModel) table = table.tableName;
		
		self.associations[table] = "belongsTo";
	});
};

Model.prototype.hasOne = function () {
	var self = this
	  , regex = /((.)*)(\s*(\sthrough\s|\svia\s)\s*)((.)*)/gi
	  , tables = Array.prototype.slice.call(arguments);

	tables.forEach(function (table) {
		var table
		  , through;
	
		if (typeof table === "string") {
			var matches = regex.exec(table);
			if (matches) {
				table = matches[1];
				through = matches[5];
			}
		} else if (table.isModel) {
			table = table.tableName;
		} else if (table.through) {
			through = table.through;
			table = table.model;
		} else {
			return;
		}
	
		if (!through) return self.associations[table] = "hasOne";
	
		self.associations[table] = { type: "hasOne", through: through };
	});

	return this;
};

Model.prototype.hasAndBelongsToMany = function () {
	var self = this
	  , tables = Array.prototype.slice.call(arguments);

	tables.forEach(function (table) {
		if (table.isModel) table = table.tableName;
		
		var connectorModels = self.db.settings.connectorModel(table, self.tableName);
		
		if (!Array.isArray(connectorModels)) connectorModels = [connectorModels];
		
		for (var i = 0, len = connectorModels.length; i < len; i++) {
			if (!self.db[connectorModels[i]]) continue;
			
			return self.associations[table] = { type: "hasMany", through: connectorModels[i] };
		}
	});
	return this;
};

Model.prototype.hABTM = Model.prototype.hasAndBelongsToMany;

Model.prototype.paired = function () {
	var self = this
	  , tables = Array.prototype.slice.call(arguments);

	tables.forEach(function (table) {
		if (table.isModel) table = table.tableName;
		
		self.associations[table] = "paired";
	});
};

Model.prototype.Query = function () {
	return new Find(this);
};

Model.prototype.save = function (obj, _cb, onDupeKey) {
	// timestamps?
	this.client.save(this.tableName, this.getFields(), obj, onDupeKey, _cb);
};

Model.prototype.setPolymorphic = function () {
	var self = this
	  , db = self.db
	  , aliases = Array.prototype.slice.call(arguments);

	aliases.forEach(function (alias) {
		db[alias] = new Model(alias, db);
		db[alias].isPolymorph = true;
		self.associations[alias] = "polymorphic";

		for (var prop in db) {
			if (!db[prop].isModel) continue;
			if (db[prop].associations[self.tableName]) continue;

			db[prop].contraPolymorphic(self, alias);
		}
	});
	
	return this;
};

Model.prototype.contraPolymorphic = function (table, polymorph) {
	var name = table.isModel ? table.tableName : table;
	this.associations[name] = { type: "contraPolymorphic", through: polymorph };
};

(function () {
	
	// Access Find methods directly from model for convenience.
	for (var prop in Find.prototype) {
		(function (prop) {
			Model.prototype[prop] = function () {
				var find = new Find(this);
				return find[prop].apply(find, arguments);
			}
		})(prop);
	}
	
})();

module.exports = Model;