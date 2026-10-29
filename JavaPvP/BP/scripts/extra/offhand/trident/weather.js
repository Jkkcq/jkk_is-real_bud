import { WeatherType, world, system } from "@minecraft/server";
export class Weather {
static currentWeather = WeatherType.Clear;
static initialize() {
system.run(() => {
const storedWeather = world.getDynamicProperty("weather");
if (storedWeather) {
this.currentWeather = storedWeather;
} else {
this.currentWeather = WeatherType.Clear;
}
});
world.afterEvents.weatherChange.subscribe((data) => {
this.currentWeather = data.newWeather;
world.setDynamicProperty("weather", data.newWeather);
});
}
}