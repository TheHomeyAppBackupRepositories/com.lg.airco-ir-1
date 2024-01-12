'use strict';

const LGACDevice = require('../../lib/LGACDevice');

/**
 * Type 1
 * LG Protocol
 * GE6711AR2853M: no vane (but always send it)
 * GE6711AR2853M: vane
 */
module.exports = class LGACType1Device extends LGACDevice {

  constructor(...opts) {
    super('lg', true, false, ...opts);
  }

};
