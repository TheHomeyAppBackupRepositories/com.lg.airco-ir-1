'use strict';

const LGACDevice = require('../../lib/LGACDevice');

/**
 * Type 2
 * LG2 Protocol
 * AKB75215403: no vane
 */
module.exports = class LGACType2Device extends LGACDevice {

  constructor(...opts) {
    super('lg2', false, false, ...opts);
  }

};
