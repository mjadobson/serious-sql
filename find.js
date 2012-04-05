var lingo = require("lingo");

var Find = function (model) {
	if (!model) return this;
	
	this.model = model;
	this.client = model.client;
	this.db = model.db;
	this.query = { where: [], set: [] };
	this.params = { where: [], set: [] };
	return this;
};

Find.prototype._copyState = function (find) {
	this.query = JSON.parse(JSON.stringify(find.query));
	this.params = JSON.parse(JSON.stringify(find.params));
	this._prefetch = find._prefetch;
};

Find.prototype.where = function () {
	var self = this
	  , args = Array.prototype.slice.call(arguments)
	  , condition = args.shift()
	  , tableName = this.model.tableName
	  , bits = [];
	
	if (this.model.isAlias) tableName = this.model.aliasOf;
	
	args.forEach(function (arg) {
		self.params.where = self.params.where.concat(arg);
	});
	
	if (typeof condition === "object") {
		for (var prop in condition) {
			if (!condition.hasOwnProperty(prop)) continue;
			
			if (Array.isArray(condition[prop])) {
				var que = [];
				if (!condition[prop].length) condition[prop].push("WARNING: EMPTY_ARRAY !!!")
				condition[prop].forEach(function (val) {
					que.push("?");
					self.params.where.push(val);
				});
				bits.push("`" + tableName + "`.`" + prop + "` IN (" + que.join(", ") + ")");
			} else {
				bits.push("`" + tableName + "`.`" + prop + "` = ?");
				self.params.where.push(condition[prop]);
			}
		}
	}
	if (bits.length) condition = bits.join(" AND ");
	
	this.query.where.push(condition);
	return this;
};

Find.prototype.limit = function (limit, offset) {
	this.query.limit = parseInt(limit, 10) || 0;
	if (offset) this.offset(offset);
	return this;
};

Find.prototype.offset = function (offset) {
	this.query.offset = parseInt(offset, 10) || 0;
	return this;
};

Find.prototype.order = function (field, dir) {
	dir = dir.toUpperCase();
	
	switch (dir) {
	case "DESC":
	case "D":
	case "V":
		dir = "DESC";
		break;
	default:
		dir = "ASC";
	}
	
	this.query.order = { field: field, dir: dir }
	return this;
};

Find.prototype.fields = function () {
	var args = Array.prototype.slice.call(arguments);
	if (Array.isArray(args[0])) {
		this.query.fields = args[0];
	} else {
		this.query.fields = args;
	}
	return this;
};

Find.prototype.join = function (tableName, conditions) {
	this.query.join = tableName;
	if (conditions) this.on(conditions);
	return this;
};

Find.prototype.on = function (conditions) {
	this.query.on = conditions;
	return this;
};

Find.prototype.prefetch = function () {
	this._prefetch = Array.prototype.slice.call(arguments);
	return this;
};

Find.prototype.with = Find.prototype.prefetch;

Find.prototype.count = function (_cb) {
 	var tableName = this.model.tableName;
	this.client.count(tableName, this.query, this.params, _cb);
	return this;
};

Find.prototype.getAll = function (_cb) {
	var self = this
	  , prefetch = this._prefetch
	  , counter = 0
	  , tableName = this.model.tableName;
	
	if (this.model.isAlias) tableName = this.model.aliasOf;
	
	this.client.select(tableName, this.query, this.params, function (err, rows) {
		if (err) return _cb(err);
		if (!rows.length) return _cb(null, null);
		
		self.model._addInstanceMethods(rows);
		
		if (!prefetch || !prefetch.length) return _cb(null, rows);
		
		prefetch.forEach(function (table) {
			counter++;
			
			self.fetchAssociation(rows, table, function (err) {
				if (err) return _cb(err);
				
				if (!--counter) _cb(null, rows);
			});
		});
	});
	return this;
};

Find.prototype.get = function (_cb) {
	return this.limit(1).getAll(function (err, rows) {
		if (Array.isArray(rows)) rows = rows[0];
		_cb(err, rows);
	});
};

Find.prototype.fetchAssociation = function (rows, table, _cb) {
	var self = this
	  , relatedModel
	  , find
	  , assoc
	  , isArr = Array.isArray(rows);
	
	if (!_cb) _cb = function () {};
	
	if (typeof table === "string") {
		relatedModel = self.db[table];
	} else if (table.isModel) {
		relatedModel = table;
	} else if (table instanceof Find) {
		relatedModel = table.model;
		find = table;
	}
	
	assoc = this.model.determineAssociation(relatedModel.tableName);
	
	if (!assoc) {
		console.log(
			"Warning: Association not found between " +
			this.model.tableName + " and " + relatedModel.tableName + "..."
		);
		return _cb();
	}
	
	assoc.relatedModel = relatedModel;
	assoc.find = find;
	
	if (!isArr) rows = [rows];
	
	this.model["_get" + lingo.capitalize(assoc.type)](rows, assoc, function (err) {
		if (err) return _cb(err);
		if (!isArr) return _cb(null, rows[0]);
		_cb(null, rows);
	});
};

Find.prototype._getBelongsTo = function (rows, assoc, _cb) {
	var self = this
	  , relatedModel = assoc.relatedModel
	  , find = assoc.find
	  , uniqueRelIds = []
	  , relPrimaryKey = relatedModel.getPrimaryKey()
	  , conditions = {};
	
	rows.forEach(function (row) {	
		if (~uniqueRelIds.indexOf(row[relatedModel.foreignKey])) return;
	
		uniqueRelIds.push(row[relatedModel.foreignKey]);
	});
	
	if (!uniqueRelIds.length) return _cb();
	
	conditions[relPrimaryKey] = uniqueRelIds;
	
	if (!find) find = relatedModel;
	
	find
		.where(conditions)
		.getAll(function (err, rels) {
			if (err) return _cb(err);
			if (!rels) return _cb(null, rows);
			
			rows.forEach(function (row) {
				var filteredRels = rels.filter(function (rel) {
					return row[relatedModel.foreignKey] === rel[relPrimaryKey];
				});
				if (filteredRels.length) row[lingo.en.singularize(relatedModel.tableName)] = filteredRels[0];
			});
			
			_cb(null, rows);
		});
};

Find.prototype._getHasMany = function (rows, assoc, _cb) {
	var self = this
	  , relatedModel = assoc.relatedModel
	  , find = assoc.find
	  , primaryKey = this.model.getPrimaryKey()
	  , relPrimaryKey = relatedModel.getPrimaryKey()
	  , conditions = {};
	
	var rowIds = rows.map(function (row) {
		return row[primaryKey];
	});
	
	conditions[self.model.foreignKey] = rowIds;
	
	if (!find) find = relatedModel.Query();
	
	if (assoc.through) this._joinThrough(rows, find, this.db[assoc.through], relatedModel, _cb);
	else find.where(conditions);
	
	if (assoc.one) find.limit(1);
	
	find
		.getAll(function (err, rels) {
			if (err) return _cb(err);
			if (!rels) return _cb(null, rows);
			
			rows.forEach(function addToRow(row) {
				var filteredRels = rels.filter(function (rel) {
					if (assoc.through) {
						var conAssoc = self.model.determineAssociation(assoc.through)
						  , connectorModel = self.db[assoc.through];
						if (conAssoc && conAssoc.type === "belongsTo") {
							return row[connectorModel.foreignKey] === rel[relPrimaryKey];
						}
					}
					return row[primaryKey] === rel[self.model.foreignKey];
				});
				if (assoc.one || filteredRels.length === 1) row[lingo.en.singularize(relatedModel.tableName)] = filteredRels[0];
				if (assoc.one) return;
				
				// Filter resets instance method on array.
				relatedModel._addInstanceMethods(filteredRels);
				
				if (filteredRels.length) row[relatedModel.tableName] = filteredRels;
			});
			
			_cb(null, rows);
		});
};

Find.prototype._getHasOne = function (rows, assoc, _cb) {
	assoc.one = true;
	this._getHasMany(rows, assoc, _cb);
};

Find.prototype._getPaired = function (rows, assoc, _cb) {
	var self = this
	  , relatedModel = assoc.relatedModel
	  , find = assoc.find
	  , primaryKey = this.model.getPrimaryKey()
	  , relPrimaryKey = relatedModel.getPrimaryKey();
	
	var rowIds = rows.map(function (row) {
		return row[primaryKey];
	});

	if (!find) find = relatedModel;

	find.find(rowIds, function (err, rels) {
		if (err) return _cb(err);
		if (!rels) return _cb(null, rows);
		
		rows.forEach(function addToRow(row) {
			var filteredRels = rels.filter(function (rel) {
				return row[primaryKey] === rel[relPrimaryKey];
			});
			if (filteredRels.length) row[lingo.en.singularize(relatedModel.tableName)] = filteredRels[0];
		});	
		
		_cb(null, rows);
	});
};

Find.prototype._getPolymorphic = function (rows, assoc, _cb) {
	var self = this
	  , relatedModel = assoc.relatedModel
	  , find = assoc.find
	  , obj = {}
	  , info = self.db.settings.polymorphic(relatedModel.tableName)
	  , counter = 0
	  , errCount = 0;

	rows.forEach(function (row) {
		var table = row[info.tableField]
		  , relId = row[info.foreignKey];
		
		if (!obj[table]) obj[table] = [];
		
		obj[table].push(relId);
	});

	for (var table in obj) {
		if (!obj.hasOwnProperty(table)) continue;
		
		(function (table) {
			var newRelModel = self.db[self.db.settings.polymorphic().table(table)]
			  , newFind = newRelModel.Query()
			  , relPrimaryKey = newRelModel.getPrimaryKey();

			if (find) newFind._copyState(find);

			counter++;

			newFind.find(obj[table], function (err, rels) {
				if (errCount) return;
				if (err) {
					errCount++;
					return _cb(err);
				}

				if (rels) {
					rows.forEach(function (row) {
						var filteredRels = rels.filter(function (rel) {
							return row[info.foreignKey] === rel[relPrimaryKey] && row[info.tableField] === table;
						});
						if (filteredRels.length) row[lingo.en.singularize(relatedModel.tableName)] = filteredRels[0];

						row["_" + lingo.en.singularize(relatedModel.tableName)] = table;
					});
				}

				if (--counter) return;

				_cb(null, rows);
			});

		})(table);
	}
};

Find.prototype._getContraPolymorphic = function (rows, assoc, _cb) {
	var self = this
	  , relatedModel = assoc.relatedModel
	  , find = assoc.find
	  , primaryKey = this.model.getPrimaryKey()
	  , relPrimaryKey = relatedModel.getPrimaryKey()
	  , poly = self.db.settings.polymorphic(assoc.through)
	  , conditions = {};
	
	var rowIds = rows.map(function (row) {
		return row[primaryKey];
	});
	
	conditions[poly.foreignKey] = rowIds;
	conditions[poly.tableField] = poly.contraTable(self.model.tableName);
	
	if (!find) find = relatedModel.Query();
	
	find
		.where(conditions)
		.getAll(function (err, rels) {
			if (err) return _cb(err);
			if (!rels) return _cb(null, rows);
			
			rows.forEach(function addToRow(row) {
				var filteredRels = rels.filter(function (rel) {
					return row[primaryKey] === rel[poly.foreignKey];
				});
				
				// Filter resets instance method on array.
				relatedModel._addInstanceMethods(filteredRels);

				if (filteredRels.length === 1) row[lingo.en.singularize(relatedModel.tableName)] = filteredRels[0];
				if (filteredRels.length) row[relatedModel.tableName] = filteredRels;
			});
			
			_cb(null, rows);
		});
};

Find.prototype._joinThrough = function (rows, find, connectorModel, relatedModel, _cb) {
	
	//! This is spectacularly ugly...
	//! Need to cope with through table clashes.. One part of this is:
	// `Tags`.*, `QuestionsTags`.`TagId`, `QuestionsTags`.`QuestionId` instead of just *
	
	var primaryKey = this.model.getPrimaryKey()
	  , conPrimaryKey = connectorModel.getPrimaryKey()
	  , relPrimaryKey = relatedModel.getPrimaryKey()
	  , thisConAssoc = this.model.determineAssociation(connectorModel.tableName)
	  , conRelAssoc = connectorModel.determineAssociation(relatedModel.tableName)
	  , actCon = connectorModel.isAlias ? this.db[connectorModel.aliasOf] : connectorModel
	  , actRel = relatedModel.isAlias ? this.db[relatedModel.aliasOf] : relatedModel;
	
	if (!thisConAssoc || !conRelAssoc) return _cb("'Through' pathway incomplete..");
	if (thisConAssoc.through || conRelAssoc.through) return _cb("Can't have nested 'through' associations");
	
	var field1, field2;
	switch (conRelAssoc.type) {
	case "belongsTo":
		field1 = "`" + actCon.tableName + "`.`" + relatedModel.foreignKey + "`";
		field2 = "`" + actRel.tableName + "`.`" + relPrimaryKey + "`";
		break;
	case "hasMany":
	case "hasOne":
		field1 = "`" + actCon.tableName + "`.`" + conPrimaryKey + "`";
		field2 = "`" + actRel.tableName + "`.`" + connectorModel.foreignKey + "`";
		break;
	case "paired":	
		field1 = "`" + actCon.tableName + "`.`" + conPrimaryKey + "`";
		field2 = "`" + actRel.tableName + "`.`" + relPrimaryKey + "`";
	}
	
	find.join(actCon.tableName, field1 + " = " + field2);
	
	var conditions
	  , rowIds = rows.map(function (row) { return row[primaryKey]; })
	  , uniqueRelIds = [];
	
	rows.forEach(function (row) {	
		if (~uniqueRelIds.indexOf(row[connectorModel.foreignKey])) return;
		uniqueRelIds.push(row[connectorModel.foreignKey]);
	});
	
	switch (thisConAssoc.type) {
	case "belongsTo":
		conditions = {};
		conditions[actCon.foreignKey] = uniqueRelIds;
		break;
	case "hasMany":
	case "hasOne":
		conditions = "`" + actCon.tableName + "`.`" + this.model.foreignKey + "`";
		conditions += " IN (" + rowIds.join(", ") + ")";
		break;
	case "paired":
		conditions = {};
		conditions[primaryKey] = rowIds;
	}
	
	find.where(conditions);
};

Find.prototype.set = function (foo) {
	var self = this
	  , args = Array.prototype.slice.call(arguments)
	  , foo = args.shift()
	  , bits = [];
	
	args.forEach(function (arg) {
		self.params.set = self.params.set.concat(arg);
	});
	
	if (typeof foo === "object") {
		for (var prop in foo) {
			if (!foo.hasOwnProperty(prop)) continue;
			
			bits.push("`" + prop + "` = ?");
			self.params.set.push(foo[prop]);
		}
	}
	if (bits.length) foo = bits.join(", ");
	
	this.query.set.push(foo);
	return this;
};

Find.prototype.updateAll = function (_cb) {
	var tableName = this.model.tableName;
	this.client.update(tableName, this.query, this.params, _cb);
	return this;
};

Find.prototype.update = function (_cb) {
	return this.limit(1).updateAll(_cb);
};

Find.prototype.deleteAll = function (_cb) {
	var tableName = this.model.tableName;
	this.client.delete(tableName, this.query, this.params, _cb);
	return this;
};

Find.prototype.delete = function (_cb) {
	return this.limit(1).deleteAll(_cb);
};

Find.prototype.find = function (id, _cb) {
	var conditions = {}
	  , primaryKey = this.model.getPrimaryKey();
	
	conditions[primaryKey] = id;
	
	this.where(conditions);
	
	if (!_cb) return this;
	
	if (Array.isArray(id)) return this.getAll(_cb);
		
	return this.get(_cb);
};

module.exports = Find;