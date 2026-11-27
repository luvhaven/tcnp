// The background location task must be registered before anything else: when
// the system wakes the app with a new position, no screen is mounted.
import './src/location'
import { registerRootComponent } from 'expo'
import App from './App'

registerRootComponent(App)
