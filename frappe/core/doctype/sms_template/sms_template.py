# -*- coding: utf-8 -*-
# Copyright (c) 2021, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
from frappe.core.doctype.sms_settings.sms_settings import get_contact_number
from frappe.utils import cstr


class SMSTemplate(Document):
	def autoname(self):
		self.name = self.reference_doctype
		if self.notification_type:
			self.name += "-" + self.notification_type

	def get_rendered_message(self, context=None, doc=None):
		context = get_context(context, doc)
		message = frappe.render_template(self.message, context)
		return message


@frappe.whitelist()
def get_sms_defaults(dt, dn, notification_type=None, contact=None, mobile_no=None, party_doctype=None, party=None):
	if not mobile_no and (contact or party_doctype or party):
		mobile_no = get_contact_number(contact, party_doctype, party)

	sms_template = get_sms_template(dt, notification_type)

	message = ""
	if sms_template:
		doc = frappe.get_doc(dt, dn)
		message = sms_template.get_rendered_message(doc=doc)

	return {
		"mobile_no": mobile_no,
		"message": message,
	}


def get_sms_template_message(notification_type=None, doc=None, context=None):
	sms_template = get_sms_template(doc.doctype, notification_type)
	if not sms_template:
		return ""

	context = get_context(context, doc)
	return sms_template.get_rendered_message(context=context)


def get_sms_template(reference_doctype, notification_type=None):
	notification_type = cstr(notification_type)

	template = frappe.db.sql_list("""
		select name
		from `tabSMS Template`
		where reference_doctype = %s and ifnull(notification_type, '') = %s and enabled = 1
		limit 1
	""", [reference_doctype, notification_type])

	if template:
		template_doc = frappe.get_cached_doc("SMS Template", template[0])
		return template_doc
	else:
		return None


def get_context(context=None, doc=None):
	if not context:
		context = {'doc': {}}

	if doc:
		context['doc'] = doc

	return context
