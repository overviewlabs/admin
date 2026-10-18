#!/usr/bin/env python3
"""Refresh the pinned official Open-Meteo parameter catalog (requires PyYAML).

Run explicitly, never on startup. Provider schemas and their website options are
combined because the website documents variables newer than its OpenAPI files.
"""
import copy
import json
import re
import urllib.request
import urllib.error
from pathlib import Path
import yaml

API_REV = 'f625df2c2b2d29d7837b1c71660fb226b1864f9b'
WEB_REV = '1755598c7ac9cf56db13d540f43b73ba97207219'
ROOT = Path(__file__).resolve().parents[1]

def read(repo, rev, path):
    url = f'https://raw.githubusercontent.com/open-meteo/{repo}/{rev}/{path}'
    return urllib.request.urlopen(url, timeout=30).read().decode()

def choices(text, name):
    match = re.search(r'export const ' + re.escape(name) + r'(?:\s*:[^=\n]+)?\s*=\s*\[', text)
    if not match:
        return []
    tail = text[match.end():]
    end = tail.find('\nexport ')
    if end >= 0:
        tail = tail[:end]
    # A section may contain additional declarations without "export"; stop at
    # its first top-level closing bracket, preserving nested option groups.
    depth = 1
    for index, char in enumerate(tail):
        if char == '[': depth += 1
        elif char == ']': depth -= 1
        if depth == 0:
            tail = tail[:index]
            break
    return re.findall(r"value:\s*['\"]([^'\"]+)['\"]", tail)

catalog = {}
slugs = {'forecast': ('forecast', ''), 'historical': ('historical-weather', 'historical-weather-api'),
         'air_quality': ('air-quality', 'air-quality-api'), 'marine': ('marine', 'marine-weather-api'),
         'ensemble': ('ensemble', 'ensemble-api'), 'seasonal': ('seasonal', 'seasonal-forecast-api'),
         'climate': ('climate', 'climate-api'), 'flood': ('flood', 'flood-api'), 'elevation': ('elevation', 'elevation-api')}
for name, (file, slug) in slugs.items():
    schema = yaml.safe_load(read('open-meteo', API_REV, 'openapi/' + file + '.yml'))
    path, operation = next(iter(schema['paths'].items()))
    params = {p['name']: {**p['schema'], 'required': bool(p.get('required')), 'description': p.get('description', '').strip()}
              for p in operation['get']['parameters'] if p['name'] != 'apikey'}
    try:
        options = read('open-meteo-website', WEB_REV, 'src/routes/en/docs/' + (slug + '/' if slug else '') + 'options.ts')
    except urllib.error.HTTPError as exc:
        if exc.code != 404: raise
        options = '' # e.g. elevation has no variable-options file
    for field in ('hourly', 'daily', 'current', 'minutely_15', 'models', 'weekly', 'monthly'):
        values = choices(options, field)
        extra = {'hourly': ('additionalVariables', 'solarVariables', 'aqi_european', 'aqi_united_states'),
                 'daily': ('additionalDaily', 'dailyWithUvIndex'), 'weekly': ('additionalWeekly', 'weeklySpecial'),
                 'monthly': ('additionalMonthly',)}.get(field, ())
        for section in extra: values += choices(options, section)
        if values:
            param = params.setdefault(field, {'type': 'array', 'items': {'type': 'string'}, 'required': False})
            param['items']['enum'] = sorted(set(param['items'].get('enum', []) + values))
    # Native parameters explicitly included in each official page's form.
    default_match = re.search(r'export const defaultParameters\s*=\s*\{(.*?)\n\};', options, re.S)
    if default_match:
        for field in re.findall(r'^\s*([a-z][a-z0-9_]*):', default_match[1], re.M):
            if field in params or field in ('location_mode', 'csv_coordinates', 'time_mode'): continue
            if field in ('past_hours', 'forecast_hours', 'past_minutely_15', 'forecast_minutely_15'):
                params[field] = {'type': 'integer', 'minimum': 0, 'maximum': 1536 if 'minutely' in field else 8784}
            elif field == 'cell_selection': params[field] = {'type': 'string', 'enum': ['land', 'sea', 'nearest']}
            elif field == 'temporal_resolution': params[field] = {'type': 'string', 'enum': ['hourly', 'hourly_3', 'hourly_6', 'native']}
            elif field in ('tilt', 'azimuth'): params[field] = {'type': 'number', 'allowNan': True}
    if 'current' in params and 'hourly' in params:
        params['current']['items']['enum'] = sorted(set(params['current']['items']['enum'] + params['hourly']['items']['enum']))
    catalog[name] = {'url': operation['servers'][0]['url'] + path, 'docs': 'https://open-meteo.com/en/docs' + ('/' + slug if slug else ''), 'parameters': params}

# Options documented on the live API pages, including regional interpolation
# and solar tracking. The provider validates availability per chosen model.
forecast = catalog['forecast']['parameters']
for name in ('forecast_minutely_15', 'past_minutely_15'):
    forecast[name] = {'type': 'integer', 'minimum': 0, 'maximum': 1536}
for name in ('start_hour', 'end_hour', 'start_minutely_15', 'end_minutely_15'):
    forecast[name] = {'type': 'string', 'format': 'date-time'}
forecast['temporal_resolution'] = {'type': 'string', 'enum': ['hourly', 'hourly_3', 'hourly_6', 'native']}
for name in ('current', 'minutely_15'):
    forecast[name]['items']['enum'] = sorted(set(forecast[name]['items']['enum'] + forecast['hourly']['items']['enum']))
for name in ('tilt', 'azimuth', 'elevation'):
    forecast[name]['allowNan'] = True
for spec in catalog.values():
    if 'elevation' in spec['parameters']: spec['parameters']['elevation']['allowNan'] = True
for name in ('historical_forecast', 'single_run', 'previous_runs'):
    entry = copy.deepcopy(catalog['forecast'])
    host = {'historical_forecast': 'historical-forecast-api', 'single_run': 'single-runs-api', 'previous_runs': 'historical-forecast-api'}[name]
    entry['url'] = f'https://{host}.open-meteo.com/v1/forecast'
    slug = {'historical_forecast': 'historical-forecast-api', 'single_run': 'single-runs-api', 'previous_runs': 'previous-runs-api'}[name]
    entry['docs'] = 'https://open-meteo.com/en/docs/' + slug
    if name == 'historical_forecast':
        for field in ('start_date', 'end_date'): entry['parameters'][field]['required'] = True
    if name == 'single_run': entry['parameters']['run'] = {'type': 'string', 'format': 'date-time', 'required': True}
    catalog[name] = entry

entry = copy.deepcopy(catalog['ensemble'])
entry['docs'] = 'https://open-meteo.com/en/docs/ensemble-mean-api'
options = read('open-meteo-website', WEB_REV, 'src/routes/en/docs/ensemble-mean-api/options.ts')
entry['parameters']['models']['items']['enum'] = choices(options, 'models')
entry['parameters']['forecast_days']['maximum'] = 35
catalog['ensemble_mean'] = entry

entry = copy.deepcopy(catalog['forecast'])
entry['docs'] = 'https://open-meteo.com/en/docs/satellite-radiation-api'
options = read('open-meteo-website', WEB_REV, 'src/routes/en/docs/satellite-radiation-api/options.ts')
for field in ('hourly', 'daily', 'models'):
    entry['parameters'][field]['items']['enum'] = choices(options, field)
for field in ('current', 'minutely_15'): entry['parameters'].pop(field, None)
catalog['satellite_radiation'] = entry

catalog['geocoding'] = {'url': 'https://geocoding-api.open-meteo.com/v1/search', 'docs': 'https://open-meteo.com/en/docs/geocoding-api', 'parameters': {
    'name': {'type': 'string', 'required': True, 'minLength': 2, 'maxLength': 200},
    'count': {'type': 'integer', 'minimum': 1, 'maximum': 100, 'default': 5},
    'language': {'type': 'string', 'minLength': 2, 'maxLength': 3, 'default': 'en'},
    'countryCode': {'type': 'string', 'minLength': 2, 'maxLength': 2}}}
catalog['location'] = {'url': 'https://geocoding-api.open-meteo.com/v1/get', 'docs': catalog['geocoding']['docs'], 'parameters': {'id': {'type': 'integer', 'minimum': 1, 'maximum': 2147483647, 'required': True}}}
target = ROOT / 'server/src/services/weather-catalog.generated.ts'
target.write_text('/** Generated from pinned official Open-Meteo schemas/options; see scripts/generate-open-meteo-catalog.py. */\n'
                  + 'export const OPEN_METEO_CATALOG_REVISION = ' + json.dumps({'api': API_REV, 'website': WEB_REV}) + ';\n'
                  + 'export const OPEN_METEO_CATALOG: Record<string, WeatherEndpoint> = ' + json.dumps(catalog, separators=(',', ':')) + ';\n'
                  + 'export type WeatherParameter = { type: string; required?: boolean; description?: string; enum?: string[]; items?: {type: string; enum?: string[]}; minimum?: number; maximum?: number; default?: unknown; format?: string; minLength?: number; maxLength?: number; allowNan?: boolean };\n'
                  + 'export type WeatherEndpoint = {url: string; docs: string; parameters: Record<string, WeatherParameter>};\n')
print('Generated', len(catalog), 'Open-Meteo endpoints')
