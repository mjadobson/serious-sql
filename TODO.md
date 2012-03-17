## Goals
* Least setup possible (Bend lib to your own conventions!)
* Nice, flexible syntax
* Fewest db calls possible
* Async
(* Rewrite/restructure!!)

## Logistics
* UNIT TESTS
* WEBSITE / DOCUMENTATION

## Associations
* Allow multiple possible foreignKey matches for tables.
* Determine hasOne over hasMany?
|--> Maybe check singular on db.users.limit(10).prefetch("profile", "posts").getAll(cb)
Y THROUGH associations
|--> "network via profile"
* Recursive THROUGH associations..
* POLYMORPHIC associations. (Sorely needed for Comments and Reads in s3ac !)
|--> parentId = 34, parentType = "post"
Y Option to associate through primaryKeys?
Y Auto-generate associations on startup.
Y Manually setting associations should clear auto-generated stuff.
* Limits on prefetches don't work as might be expected. (Really important to fix, but no idea how, with the current system D:)
Y Fix ambiguity on where clauses for joins.

## ORMify
* Create table..?
* ModelNames as well as TableNames.
* Add foreignKey per assoc. { type: "hasMany", foreignKey: "UserId" }
Y Check whether alias works for through.
Y Aliases: « db.Blogs.prefetch(db.Readers, db.Owners, db.Writers »
* Allow reverse alias: « db.Users.prefetch(db.Blogs.as(db.Readers)).find(12) » (?)
* PrimaryKey auto-sets instead of having getPK() method.
* Multiple foreignKeys.

## Querying
Y Separate build function.
Y Field support.
Y Escape input.
Y For console.log() do replace for ? with replacements.
Y Date.toSQL();
Y Fix ?/param mismatch.
* Check timestamp data type. Created / Modified.
Y Set/where objects to SQL string.
Y Count functionality.
Y Get+collect datatypes of all fields. Get primary key of table (AI?).
* Option to provide primaryKey generator. Have default.
* Paranoid delete option.
Y Recursive prefetching
Y prefetching conditions
Y Move table-get logic to mysql.js
Y Make query things separate from models. Or else they may overlap;
Y updateAll
Y deleteALl
Y Fix associated arrays having no instance methods.
* Through associations and fields should be like `SubsUsers`.*, `Subs`.`id`

## Instance methods
Y Add custom..
Y Fetch Associations
* Set Associations
Y Update/Save
|--> Use default values and info.insertId to update saved object.
Y Delete