'use strict';
'require view';
'require rpc';
'require uci';
'require ui';
'require dom';
'require form';

var callGetInfo = rpc.declare({ object: 'luci.gately', method: 'get_info', expect: { } });
var callSetConfig = rpc.declare({ object: 'luci.gately', method: 'set_config', params: ['key', 'value'], expect: { } });
var callService = rpc.declare({ object: 'luci.gately', method: 'service', params: ['action'], expect: { } });

return view.extend({
	pendingTasks: [],

	load: function() {
		return Promise.all([
			uci.load('gately'),
			callGetInfo()
		]);
	},

	queueSetConfig: function(key, value) {
		var p = callSetConfig(key, value).then(function(res) {
			if (res && res.ret !== 0 && res.error) {
				ui.addNotification(null, E('p', res.error), 'error');
			}
			return res;
		});
		this.pendingTasks.push(p);
		return p;
	},

	handleSave: function(ev) {
		var self = this;
		this.pendingTasks = [];
		var map = this.formMap;
		if (!map) return Promise.resolve();

		return map.save(null, true).then(function() {
			return Promise.all(self.pendingTasks);
		}).then(function() {
			return uci.save();
		}).then(function() {
			return callSetConfig('commit_uci', '');
		}).then(function() {
			if (ui.changes && typeof ui.changes.setIndicator === 'function') {
				ui.changes.setIndicator(0);
			}
		}).catch(function(err) {
			ui.addNotification(null, E('p', err.message || String(err)), 'error');
			return Promise.reject(err);
		});
	},

	handleSaveApply: function(ev, mode) {
		var self = this;
		return this.handleSave(ev).then(function() {
			var enabled = uci.get('gately', 'main', 'enabled');
			var action = (enabled === '1') ? 'restart' : 'stop';
			ui.showModal(null, [ E('p', { class: 'spinning' }, _('Updating configuration and restarting service...')) ]);
			return callService(action).then(function() {
				ui.hideModal();
				if (ui.changes && typeof ui.changes.setIndicator === 'function') {
					ui.changes.setIndicator(0);
				}
				ui.addNotification(null, E('p', _('Configuration updated successfully')), 'info');
				uci.unload('gately');
				return self.load().then(function(data) {
					return self.render(data);
				}).then(function(node) {
					var mapEl = document.querySelector('.cbi-map');
					if (mapEl && mapEl.parentNode) dom.content(mapEl.parentNode, node);
				});
			});
		});
	},

	render: function(data) {
		var self = this;
		var baseConf = (data[1] && data[1].base_conf) ? data[1].base_conf : {};
		var m, s, o;

		m = new form.Map('gately', _('Gately Settings'), _('Gately is an open-source, auditable network gateway toolkit (Lucky alternative) integrating DDNS, STUN, port forwarding, reverse proxy, ACME certificates, and WAF.'));
		this.formMap = m;

		s = m.section(form.NamedSection, 'main', 'gately', _('Global Settings'));
		s.anonymous = true;
		s.addremove = false;

		// Enable service
		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.rmempty = false;

		// Config Directory (UCI)
		o = s.option(form.Value, 'configdir', _('Config Directory Path'));
		o.rmempty = false;
		o.placeholder = '/etc/gately';

		// Initial Password (UCI + account.json reset on change)
		o = s.option(form.Value, 'initial_password', _('Initial Admin Password'));
		o.password = true;
		o.rmempty = false;
		o.default = 'admin123456';
		o.placeholder = 'admin123456';
		o.description = _('Admin password (at least 8 characters, default: admin123456). Modifying this and clicking Save & Apply will update the admin password immediately.');
		o.validate = function(section_id, value) {
			if (!value || value.length < 8) {
				return _('Password must be at least 8 characters');
			}
			return true;
		};
		o.write = function(section_id, value) {
			uci.set('gately', section_id, 'initial_password', value);
			self.queueSetConfig('initial_password', value);
		};

		// Admin Panel Settings (gately.json)
		s = m.section(form.TypedSection, 'gately', _('Admin Panel Settings'));
		s.anonymous = true;
		s.addremove = false;

		// Admin Port
		o = s.option(form.Value, 'admin_port', _('Admin Web Listen Port'));
		o.datatype = 'port';
		o.rmempty = false;
		o.placeholder = '16680';
		o.load = function(section_id) {
			return baseConf.AdminWebListenPort || '16680';
		};
		o.write = function(section_id, value) {
			self.queueSetConfig('admin_http_port', value);
		};

		// Admin Safe URL (safePath in gately.json)
		o = s.option(form.Value, 'admin_safe_url', _('Admin Safe URL'));
		o.placeholder = '/secret-entry';
		o.load = function(section_id) {
			return baseConf.SafeURL || '';
		};
		o.validate = function(section_id, value) {
			if (!value) return true;
			var v = value.trim();
			if (v.charAt(0) !== '/') v = '/' + v;
			if (v.length < 4) {
				return _('Safe URL must be at least 3 characters after "/"');
			}
			if (v === '/api' || v.indexOf('/api/') === 0 || v.indexOf('/assets') === 0 || /[ ?#]/.test(v)) {
				return _('Safe URL cannot start with /api or /assets, nor contain spaces, ? or #');
			}
			return true;
		};
		o.write = function(section_id, value) {
			self.queueSetConfig('admin_safe_url', value);
		};
		o.remove = function(section_id) {
			self.queueSetConfig('admin_safe_url', '');
		};

		// Allow Internet Access (!lanOnly in gately.json)
		o = s.option(form.Flag, 'admin_internet', _('Allow Internet Access'));
		o.rmempty = false;
		o.load = function(section_id) {
			return baseConf.AllowInternetaccess ? '1' : '0';
		};
		o.write = function(section_id, value) {
			self.queueSetConfig('switch_Internetaccess', (value === '1'));
		};
		o.remove = function(section_id) {
			self.queueSetConfig('switch_Internetaccess', false);
		};

		return m.render();
	}
});
