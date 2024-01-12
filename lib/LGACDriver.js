'use strict';

const Homey = require('homey');

module.exports = class LGACDriver extends Homey.Driver {

  async onInit() {
    this.homey.flow.getActionCard('set_operation_mode')
      .registerRunListener(async ({ device, mode }) => {
        return device.triggerCapabilityListener('operation_mode', mode);
      });
    this.homey.flow.getActionCard('set_fan_mode')
      .registerRunListener(async ({ device, speed }) => {
        return device.triggerCapabilityListener('fan_mode', speed);
      });
    this.homey.flow.getActionCard('set_swingv_mode')
      .registerRunListener(async ({ device, swingVMode }) => {
        return device.triggerCapabilityListener('swingv_mode', swingVMode);
      });
  }

  async onPairListDevices() {
    return [{
      data: {
        id: `${Math.random()}`,
      },
    }];
  }

};
