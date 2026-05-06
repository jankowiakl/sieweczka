GRID_vanvan conversion

Source: GRID_vanvan.gpkg, layer vanvan, CRS EPSG:2180.
Output: grid_vanvan_wgs84.geojson, CRS EPSG:4326 / CRS84 for Leaflet.
ID field: id.
Place this file in the repository as: data/grid_vanvan_wgs84.geojson

Command:
ogr2ogr -f GeoJSON -t_srs EPSG:4326 data/grid_vanvan_wgs84.geojson data/GRID_vanvan.gpkg
