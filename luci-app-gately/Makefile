# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2026 OpenWrt.org
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-gately

LUCI_TITLE:=LuCI Support for Gately
LUCI_DEPENDS:=+gately
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
