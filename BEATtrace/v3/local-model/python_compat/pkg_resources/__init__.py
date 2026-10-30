"""Small compatibility surface for resampy on setuptools versions without pkg_resources.

The Basic Pitch service only needs resource_filename to locate resampy's bundled
filter tables. This intentionally does not implement the deprecated general API.
"""
from importlib.resources import files
import os


def resource_filename(package_or_requirement, resource_name):
    return os.fspath(files(package_or_requirement).joinpath(resource_name))
