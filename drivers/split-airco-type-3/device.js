'use strict';

const LGACDevice = require('../../lib/LGACDevice');

/**
 * Type 3
 * LG2 Protocol
 * AKB74955603: vane, different low/high value
 */
module.exports = class LGACType3Device extends LGACDevice {

  constructor(...opts) {
    super('lg2', true, true, ...opts);
  }

};
