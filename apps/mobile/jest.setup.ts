import { configure } from '@testing-library/react-native';

// Screens render after async loads; under parallel test load the 1 s default can be too short.
configure({ asyncUtilTimeout: 5000 });
