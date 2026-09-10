/**
 * Setup for the **component** project: everything the data project has, plus React Native.
 *
 * `@testing-library/react-native` auto-cleans between tests as of v12, so there is nothing to add
 * here beyond the shared harness — but component tests get the same frozen clock, the same
 * timezone and the same matchers, so a screen test and a query test agree about what day it is.
 */
import './common';
