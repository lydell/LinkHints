// @flow

// If a malicious site sends these events/messages it doesn't hurt much. All the
// page could do is cause false positives or disable detection of click events
// altogeher.
export const CLICKABLE_EVENT = `__SynthWebExt_Clickable_${BUILD_TIME}`;
export const UNCLICKABLE_EVENT = `__SynthWebExt_Unclickable_${BUILD_TIME}`;
export const RESET_INJECTION = `__SynthWebExt_ResetInjection_${BUILD_TIME}`;
