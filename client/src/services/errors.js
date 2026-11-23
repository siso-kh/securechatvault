export class BlockedError extends Error {
  constructor(rule) {
    super(`Message not sent. A rule blocks ${rule.label}. Remove it and try again.`);
    this.rule = rule;
  }
}