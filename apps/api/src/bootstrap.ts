/**
 * BigInt JSON serialization
 * Allows BigInt to be serialized to JSON as strings
 */

if (!('toJSON' in BigInt.prototype)) {
  // @ts-ignore - adding toJSON to BigInt prototype
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
}
