'use strict';

const Homey = require('homey');

/**
 * LG Split Airco Device
 *
 * State is sent as a 32-bit integer, with the following bit layout:
 * | 31 - 28| 27 - 20 | 19 - 18 | 17 - 15 | 14 - 12 | 11 - 8 | 7 - 4 | 3 - 0 |
 * |        | Sign    | Power   |         | Mode    | Temp   | Fan   | Sum   |
 *
 * GE6711AR2853M: LG1, no vane
 * GE6711AR2853M: LG1, vane
 *
 * AKB75215403: LG2, no vane
 * AKB74955603: LG2, vane, must switch light off as last message? Uses different low and high values!
 * AKB73757604: LG2, ceiling model, multiple vanes. Not supported for now.
 *
 * Combine the following models:
 * - type 1: GE6711AR2853M + GE6711AR2853M (just always send vane)
 * - type 2: AKB75215403 (LG2, no vane)
 * - type 3: AKB74955603 (LG2, vane, different low/high)
 */

const LG_SUM_POS = 0;
const LG_FAN_POS = 4;
const LG_TEMP_POS = 8;
const LG_MODE_POS = 12;
const LG_POWER_POS = 18;
const LG_SIGN_POS = 20;

const LG_SUM_LEN = 4;

const LG_FAN_MODE_LOWEST = 0b0000;
const LG_FAN_MODE_LOW = 0b0001; // Low for all models except AKB74955603
const LG_FAN_MODE_MEDIUM = 0b0010;
const LG_FAN_MODE_MAX = 0b0100; // High for all models except AKB74955603
const LG_FAN_MODE_AUTO = 0b0101;
const LG_FAN_MODE_LOW_ALT = 0b1001; // Low for AKB74955603
const LG_FAN_MODE_HIGH = 0b1010; // High for AKB74955603

const LG_TEMP_MIN = 16;
const LG_TEMP_MAX = 30;
const LG_TEMP_DEFAULT = 22;
const LG_TEMP_ADJUST = 15;

const LG_MODE_AUTO = 0b011;
const LG_MODE_COOL = 0b000;
const LG_MODE_DRY = 0b001;
const LG_MODE_FAN = 0b010;
const LG_MODE_HEAT = 0b100;

const LG_POWER_OFF_COMMAND = 0x88C0051;
const LG_POWER_ON = 0b11;
const LG_POWER_OFF = 0b00;

const LG_SIGN = 0x88;

// Complete SwingV commands
const LG_SWINGV_AUTO = 0x8813149;
const LG_SWINGV_HIGHEST = 0x881309D;
const LG_SWINGV_HIGH = 0x881308C;
const LG_SWINGV_UPPER_MIDDLE = 0x881307B;
const LG_SWINGV_MIDDLE = 0x881306A;
const LG_SWINGV_LOW = 0x8813059;
const LG_SWINGV_LOWEST = 0x8813048;
const LG_SWINGV_OFF = 0x881315A;

module.exports = class LGACDevice extends Homey.Device {

  constructor(signal, hasVane, altLowHigh, ...opts) {
    super(...opts);
    this._signalName = signal;
    this._hasVane = hasVane;
    this._altLowHigh = altLowHigh;
  }

  async onInit() {
    this._signal = await this.homey.rf.getSignalInfrared(this._signalName);
    this.registerMultipleCapabilityListener(this.getCapabilities(), this.onCapabilitiesChanged.bind(this), 1000);
  }

  async onCapabilitiesChanged(valuesObj) {
    await this.setState({
      on: valuesObj.onoff ?? this.getCapabilityValue('onoff') ?? false,
      temperature: valuesObj.target_temperature ?? this.getCapabilityValue('target_temperature') ?? LG_TEMP_DEFAULT,
      mode: valuesObj.operation_mode ?? this.getCapabilityValue('operation_mode') ?? 'auto',
      fanMode: valuesObj.fan_mode ?? this.getCapabilityValue('fan_mode') ?? 'medium',
      swingVMode: valuesObj.swingv_mode ?? this.getCapabilityValue('swingv_mode') ?? 'off',
    });
  }

  async setState({
    on = true,
    temperature = LG_TEMP_DEFAULT,
    mode = 'auto',
    fanMode = 'medium',
    swingVMode = 'off',
  } = {}) {
    // console.log(`setState ${this.getName()} ${on} ${temperature} ${mode} ${fanMode}, ${swingVMode}`)
    // Set to default Off-command. 0x88 is the LG signature.
    let payload = 0x00000000; // JS uses 32-bit unsigned integers internally for bitwise operations

    // Calculate the payload
    if (on) {
      // Set signature (31 - 28)
      payload |= LG_SIGN << LG_SIGN_POS;

      // Power bits (27 - 20) on = 0b00 (already 0)
      payload &= ~(LG_POWER_ON << LG_POWER_POS);

      // Set mode (14 - 12)
      let bits;
      switch (mode) {
        case 'auto':
          bits = LG_MODE_AUTO;
          break;
        case 'cool':
          bits |= LG_MODE_COOL;
          break;
        case 'dry':
          bits |= LG_MODE_DRY;
          break;
        case 'fan':
          bits |= LG_MODE_FAN;
          break;
        case 'heat':
          bits |= LG_MODE_HEAT;
          break;
        default:
          throw new Error(`Invalid mode: ${mode}`);
      }
      payload |= bits << LG_MODE_POS;

      // Set temperature (11 - 8)
      const temp = Math.min(Math.max(temperature, LG_TEMP_MIN), LG_TEMP_MAX);
      payload |= (temp - LG_TEMP_ADJUST) << LG_TEMP_POS;

      // Set fan speed (7 - 4)
      switch (fanMode) {
        case 'auto':
          bits = LG_FAN_MODE_AUTO;
          break;
        case 'high':
          bits = this._altLowHigh ? LG_FAN_MODE_HIGH : LG_FAN_MODE_MAX;
          break;
        case 'medium':
          bits = LG_FAN_MODE_MEDIUM;
          break;
        case 'low':
          bits = this._altLowHigh ? LG_FAN_MODE_LOW_ALT : LG_FAN_MODE_LOW;
          break;
        case 'min':
          bits = LG_FAN_MODE_LOWEST;
          break;
        default:
          throw new Error(`Invalid fan mode: ${fanMode}`);
      }
      payload |= bits << LG_FAN_POS;

      // Calculate checksum (3 - 0)
      payload |= this._sumNibbles(payload >> LG_SUM_LEN, 4) << LG_SUM_POS;
    } else {
      // Not really clear if we cannot just turn of the power bits.
      payload = LG_POWER_OFF_COMMAND;
    }

    await this._sendIr(payload);

    // LG sends the SwingV in a separate message
    if (on && this._hasVane) {
      let swingV; // SwingV command
      switch (swingVMode) {
        case 'auto':
          swingV = LG_SWINGV_AUTO;
          break;
        case 'highest':
          swingV = LG_SWINGV_HIGHEST;
          break;
        case 'high':
          swingV = LG_SWINGV_HIGH;
          break;
        case 'upper_middle':
          swingV = LG_SWINGV_UPPER_MIDDLE;
          break;
        case 'middle':
          swingV = LG_SWINGV_MIDDLE;
          break;
        case 'low':
          swingV = LG_SWINGV_LOW;
          break;
        case 'lowest':
          swingV = LG_SWINGV_LOWEST;
          break;
        case 'off':
          swingV = LG_SWINGV_OFF;
          break;
        default:
          throw new Error(`Invalid swingV mode: ${swingVMode}`);
      }
      await this._sendIr(swingV);
    }
  }

  _sumNibbles(data, count) {
    let sum = 0;
    let copy = data;
    const nrofnibbles = (count < 16) ? count : (64 / 4);
    for (let i = 0; i < nrofnibbles; i++, copy >>= 4) {
      sum += copy & 0xF;
    }
    return sum & 0xF;
  }

  async _sendIr(payload) {
    // console.log(`payload ${payload.toString(16)}`);

    // Create 28 bits for the payload. MSB first.
    const payloadBinary = [];
    for (let i = 27; i >= 0; i--) {
      const bit = payload & (1 << i);
      payloadBinary.push(bit ? 1 : 0);
    }

    // Transmit the payload
    await this._signal.tx(payloadBinary, {
      device: this,
    })
    // .then(() => this.log('TX Complete'))
      .catch((err) => this.error('TX Error:', err));
  }

};
