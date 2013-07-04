var mysql = require("mysql");

var db = function (settings, logging) {
	var self = this;

	this.settings = settings;
	this.logging = logging;

	return this;
};

db.prototype.createPool = function () {
	this.pool = mysql.createPool(this.settings);
};

db.prototype.addTicks = function (string) {
	return "`" + string + "`";
};

db.prototype.riddlify = function () {
	return "?";
};

db.prototype.build = function (tableName, options, params) {
	var self = this
		, sql = ""
		, sqlParams = [];
	
	if (options.select) {
		sql += "SELECT ";
		if (options.fields) {
			sql += options.fields.join(", ");
		} else {
			sql += "*";
		}
		sql += " FROM " + this.addTicks(tableName);
	} else if (options.update) {
		sql += "UPDATE " + this.addTicks(tableName);
	} else if (options.delete) {
		sql += "DELETE FROM " + this.addTicks(tableName);
	}
	if (options.joins && options.joins.length) {
		sql += " " + options.joins.join(" ");
	}
	if (options.set && options.set.length) {
		sql += " SET " + options.set.join(", ");
		sqlParams = sqlParams.concat(params.set);
	}
	if (options.where && options.where.length) {
		sql += " WHERE " + options.where.join(" AND ");
		sqlParams = sqlParams.concat(params.where);
	}
	if (options.groupBy) sql += " GROUP BY " + options.groupBy;
	if (options.having) sql += " HAVING " + options.having;
	if (options.order) sql += " ORDER BY " + this.addTicks(options.order.field) + " " + options.order.dir;
	if (options.limit) sql += " LIMIT " + options.limit;
	if (options.offset) sql += " OFFSET " + options.offset;
	sql += ";";
	
	return { sql: sql, params: sqlParams };
};

db.prototype.run = function (sql, params, _cb) {
	var self = this;

	this.pool.getConnection(function (err, connection) {
		if (err) return _cb(err);

		if (self.logging) console.log(connection.format(sql, params));
		
		connection.query(sql, params, function () {
			connection.end();
			if (_cb) _cb.apply(null, arguments);
		});
	});

	return this;
};

db.prototype.listTables = function (_cb) {
	var self = this;
	return this.run("SHOW TABLES", null, function (err, rows) {
		if (err) return _cb(err);

		rows = rows.map(function (row) {
			return row["Tables_in_" + self.settings.database];
		});
		_cb(err, rows);
	});
};

db.prototype.listFields = function (tableName, _cb) {
	var sql = "SHOW FULL COLUMNS FROM " + this.addTicks(tableName);

	return this.run(sql, null, function (err, rows) {
		if (err) return _cb(err);
		
		var o = {};
		rows.forEach(function (row) {
			o[row.Field] = row;
		});
		_cb(err, o);
	});
};

db.prototype.select = function (tableName, options, params, _cb) {
	options.select = true;
	var obj = this.build(tableName, options, params);
	return this.run(obj.sql, obj.params, _cb);
};

db.prototype.update = function (tableName, options, params, _cb) {
	options.update = true;
	var obj = this.build(tableName, options, params);
	return this.run(obj.sql, obj.params, _cb);
};

db.prototype.save = function (tableName, fields, obj, onDupeKey, _cb) {
	var sql = "INSERT INTO `" + tableName + "`";
	sql += " (" + fields.map(this.addTicks).join(", ") + ")";
	sql += " VALUES "
	if (!Array.isArray(obj)) obj = [obj];
	var foo = []
		, params = [];
	obj.forEach(function (o) {
		var bar = [];
		fields.forEach(function (field) {
			if (!o.hasOwnProperty(field)) return bar.push("DEFAULT");
			bar.push("?");
			params.push(o[field]);
			
		});
		foo.push("(" + bar.join(", ") + ")");
	});
	sql += foo.join(", ");
	sql += " ON DUPLICATE KEY UPDATE"
	if (onDupeKey) sql += " " + onDupeKey;
	else sql += fields.map(function (field) { return " `" + field + "` = VALUES(`" + field + "`)"; }).join(", ");
	sql += ";";

	this.run(sql, params, _cb);
};

db.prototype.delete = function (tableName, options, params, _cb) {
	if (!options.limit && (!options.where || !options.where.length)) {
		return _cb("delete() must have conditions!");
	}
	
	if (options.offset) return _cb("Offset cannot be used for delete queries!");
	
	options.delete = true;
	var obj = this.build(tableName, options, params);
	return this.run(obj.sql, obj.params, _cb);
};

db.prototype.count = function (tableName, options, params, _cb) {
	options.select = true;
	options.fields = ["COUNT(*)"];
	var obj = this.build(tableName, options, params);
	return this.run(obj.sql, obj.params, function (err, rows) {
		if (err) return _cb(err);
		
		_cb(null, rows[0]["COUNT(*)"]);
	});
};

module.exports = db;