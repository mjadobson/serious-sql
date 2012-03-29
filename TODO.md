## Goals
* Least setup possible (Bend lib to your own conventions!)
* Nice, flexible syntax
* Fewest db calls possible
* Async
* Rewrite/restructure!!

## Logistics
* UNIT TESTS
* WEBSITE / DOCUMENTATION

## Associations

### Done:
* THROUGH associations
* Option to associate through primaryKeys?
* Auto-generate associations on startup.
* Manually setting associations should clear auto-generated stuff.
* Fix ambiguity on where clauses for joins.

### In Progress:
* POLYMORPHIC associations. Think this is done, but there are probably a bunch of quirks I missed.

### Todo:
* Allow multiple possible foreignKey matches for tables.
* Recursive THROUGH associations..
* Limits on prefetches don't work as might be expected. (Really important to fix, but no idea how with the current system...)

## ORMify

### Done:
* Check whether alias works for through.
* Aliases: « db.Blogs.prefetch(db.Readers, db.Owners, db.Writers) »

### Todo:
* Method for table/model creation..?
* Add foreignKey per assoc. { type: "hasMany", foreignKey: "UserId" }. Allows flexibility 
* Allow reverse alias: eg/ User hasMany Channels as Subscriber but hasOne Channel as Owner. Possible syntax? db.Users.prefetch(db.Blogs.as(db.Readers)).find(12)
* PrimaryKey auto-sets instead of having getPK() method.

## Querying

### Done:
* Separate build function.
* Field support.
* Escape input.
* For console.log() do replace for ? with replacements.
* Date.toSQL();
* Fix ?/param mismatch.
* Set/where objects to SQL string.
* Count functionality.
* Get+collect datatypes of all fields. Get primary key of table (AI?).
* Recursive prefetching
* prefetching conditions
* Move table-get logic to mysql.js
* Make query things separate from models. Or else they may overlap;
* updateAll
* deleteALl
* Fix associated arrays having no instance methods.

### Todo:
* Check timestamp data type. Autohandle: Created / Modified.
* Option to provide primaryKey generator. Have default.
* Paranoid delete option.
* Through association fields should be like: `SubsUsers`.*, `Subs`.`id`

## Instance methods

### Done:
* Add your own methods..
* Fetch Associations
* Update/Save
* Delete

### Todo:
* Set Associations