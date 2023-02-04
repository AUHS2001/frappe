// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt

Object.assign(frappe.model, {
	docinfo: {},
	sync: function (r) {
		/* docs:
			extract docs, docinfo (attachments, comments, assignments)
			from incoming request and set in `locals` and `frappe.model.docinfo`
		*/
		var isPlain;
		if (!r.docs && !r.docinfo) r = { docs: r };

		isPlain = $.isPlainObject(r.docs);
		if (isPlain) r.docs = [r.docs];

		if (r.docs) {
			for (var i = 0, l = r.docs.length; i < l; i++) {
				var d = r.docs[i];

				if (locals[d.doctype] && locals[d.doctype][d.name]) {
					// update values
					frappe.model.update_in_locals(d);
				} else {
					frappe.model.add_to_locals(d);
				}

				d.__last_sync_on = new Date();

				if (d.doctype === "DocType") {
					frappe.meta.sync(d);
				}

				if (d.localname) {
					frappe.model.rename_after_save(d, i);
				}
			}
		}

		frappe.model.sync_docinfo(r);
		return r.docs;
	},

	rename_after_save: (d, i) => {
		frappe.model.new_names[d.localname] = d.name;
		$(document).trigger("rename", [d.doctype, d.localname, d.name]);
		delete locals[d.doctype][d.localname];

		// update docinfo to new dict keys
		if (i === 0) {
			frappe.model.docinfo[d.doctype][d.name] = frappe.model.docinfo[d.doctype][d.localname];
			frappe.model.docinfo[d.doctype][d.localname] = undefined;
		}
	},

	sync_docinfo: (r) => {
		// set docinfo (comments, assign, attachments)
		if (r.docinfo) {
			const { doctype, name } = r.docinfo;
			if (!frappe.model.docinfo[doctype]) {
				frappe.model.docinfo[doctype] = {};
			}
			frappe.model.docinfo[doctype][name] = r.docinfo;

			// copy values to frappe.boot.user_info
			Object.assign(frappe.boot.user_info, r.docinfo.user_info);
		}

		return r.docs;
	},

	add_to_locals: function (doc) {
		if (!locals[doc.doctype]) locals[doc.doctype] = {};

		if (!doc.name && doc.__islocal) {
			// get name (local if required)
			if (!doc.parentfield) frappe.model.clear_doc(doc);

			doc.name = frappe.model.get_new_name(doc.doctype);

			if (!doc.parentfield)
				frappe.provide("frappe.model.docinfo." + doc.doctype + "." + doc.name);
		}

		locals[doc.doctype][doc.name] = doc;

		let meta = frappe.get_meta(doc.doctype);
		let is_table = meta ? meta.istable : doc.parentfield;
		// add child docs to locals
		if (!is_table) {
			for (var i in doc) {
				var value = doc[i];

				if ($.isArray(value)) {
					for (var x = 0, y = value.length; x < y; x++) {
						var d = value[x];

						if (typeof d == "object" && !d.parent) d.parent = doc.name;

						frappe.model.add_to_locals(d);
					}
				}
			}
		}
	},

	update_in_locals: function (doc) {
		// update values in the existing local doc instead of replacing
		let local_doc = locals[doc.doctype][doc.name];
		let clear_keys = function (source, target) {
			Object.keys(target).map((key) => {
				if (source[key] == undefined) delete target[key];
			});
		};

		for (let fieldname in doc) {
			let df = frappe.meta.get_field(doc.doctype, fieldname);
			if (df && frappe.model.table_fields.includes(df.fieldtype)) {
				// table
				if (!(doc[fieldname] instanceof Array)) {
					doc[fieldname] = [];
				}

				if (!(local_doc[fieldname] instanceof Array)) {
					local_doc[fieldname] = [];
				}

				// remove extra rows from local
				let new_docnames = doc[fieldname].map(d => d.name).filter(d => d);
				for (let local_d of local_doc[fieldname]) {
					if (local_d.name && !new_docnames.includes(local_d.name)) {
						// clear from local
						if (locals[local_d.doctype] && locals[local_d.doctype][local_d.name]) {
							delete locals[local_d.doctype][local_d.name];
						}
					}
				}

				// child table, override each row and append new rows if required
				for (let i = 0; i < doc[fieldname].length; i++) {
					let d = doc[fieldname][i];
					let local_d = d.name && locals[d.doctype] && locals[d.doctype][d.name];
					if (local_d) {
						// row exists, just copy the values
						Object.assign(local_d, d);
						clear_keys(d, local_d);
					} else {
						if (!d.parent) d.parent = doc.name;
						frappe.model.add_to_locals(d);
					}

					local_doc[fieldname][i] = local_d || d;
				}

				// remove extra rows
				local_doc[fieldname].length = doc[fieldname].length;
			} else {
				// literal
				local_doc[fieldname] = doc[fieldname];
			}
		}

		// clear keys on parent
		clear_keys(doc, local_doc);
	},
});
