var mysql = require("mysql");

var db = function (settings, logging) {
	this.client = mysql.createClient(settings);
	this.settings = settings;
	this.logging = logging;
	return this;
};

db.prototype.addTicks = function (string) {
	return "`" + string + "`";
};

db.prototype.format = function (sql, params) {
	return mysql.Client.prototype.format(sql, params);
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
			sql += options.fields.map(function (field) {
				if (field === "*" || field === "COUNT(*)") return field;
				return self.addTicks(field);
			}).join(", ");
		} else {
			sql += "*";
		}
		sql += " FROM " + this.addTicks(tableName);
	} else if (options.update) {
		sql += "UPDATE " + this.addTicks(tableName);
	} else if (options.delete) {
		sql += "DELETE FROM " + this.addTicks(tableName);
	}
	if (options.join) sql += " JOIN " + this.addTicks(options.join);
	if (options.on) sql += " ON " + options.on;
	if (options.set && options.set.length) {
		sql += " SET " + options.set.join(", ");
		sqlParams = sqlParams.concat(params.set);
	}
	if (options.where && options.where.length) {
		sql += " WHERE " + options.where.join(" AND ");
		sqlParams = sqlParams.concat(params.where);
	}
	if (options.order) sql += " ORDER BY " + this.addTicks(options.order.field) + " " + options.order.dir;
	if (options.limit) sql += " LIMIT " + options.limit;
	if (options.offset) sql += " OFFSET " + options.offset;
	sql += ";";
	
	if (sqlParams && sqlParams.length) sql = this.format(sql, sqlParams);
	
	return sql;
};

db.prototype.run = function (sql, _cb) {
	if (this.logging) console.log(sql);
	this.client.query(sql, _cb);
	return this;
};

db.prototype.useDatabase = function (dbName) {
	this.client.useDatabase(dbName);
	return this;
};

db.prototype.listTables = function (_cb) {
	var self = this;
	return this.run("SHOW TABLES", function (err, rows) {
		rows = rows.map(function (row) {
			return row["Tables_in_" + self.settings.database];
		});
		_cb(err, rows);
	});
};

db.prototype.listFields = function (tableName, _cb) {
	return this.run("SHOW FULL COLUMNS FROM " + this.addTicks(tableName), function (err, rows) {
		var o = {};
		rows.forEach(function (row) {
			o[row.Field] = row;
		});
		_cb(err, o);
	});
};

db.prototype.select = function (tableName, options, params, _cb) {
	options.select = true;
	var sql = this.build(tableName, options, params);
	return this.run(sql, _cb);
};

db.prototype.update = function (tableName, options, params, _cb) {
	options.update = true;
	var sql = this.build(tableName, options, params);
	return this.run(sql, _cb);
};

db.prototype.save = function (tableName, fields, obj, _cb) {
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
	sql += fields.map(function (field) { return " `" + field + "` = VALUES(`" + field + "`)"; }).join(", ");
	sql += ";";
	var sqlReady = this.format(sql, params);
	this.run(sqlReady, _cb);
};

db.prototype.delete = function (tableName, options, params, _cb) {
	if (!options.limit && (!options.where || !options.where.length)) {
		return _cb("delete() must have conditions!");
	}
	
	if (options.offset) return _cb("Offset cannot be used for delete queries!");
	
	options.delete = true;
	var sql = this.build(tableName, options, params);
	return this.run(sql, _cb);
};

db.prototype.count = function (tableName, options, params, _cb) {
	options.select = true;
	options.fields = ["COUNT(*)"];
	var sql = this.build(tableName, options, params);
	return this.run(sql, function (err, rows) {
		if (err) return _cb(err);
		
		_cb(null, rows[0]["COUNT(*)"]);
	});
};

module.exports = db;