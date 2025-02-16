import grp
import json
import logging
import os
import pwd
import subprocess
import time
from pathlib import Path

import psycopg2

APPS_CONFIG_DIR = Path('/home/briefer', '.config', 'briefer')
JUPYTER_CONFIG_DIR = Path('/home/jupyteruser', '.config', 'briefer')


def get_random_secret(size=32):
    return os.urandom(size).hex()


def get_config_path(dir):
    return Path(dir, 'briefer.json')


def get_config(dir):
    fpath = get_config_path(dir)
    with open(fpath, 'r') as f:
        cfg = json.load(f)

        # override config with env vars
        for k, default_value in generate_default_config().items():
            if k in os.environ:
                cfg[k] = os.environ[k]
            elif k not in cfg:
                cfg[k] = default_value

        return cfg


def generate_default_config():
    return {
        'NODE_ENV': 'production',
        'LOG_LEVEL': 'info',
        'POSTGRES_USERNAME': 'briefer',
        'POSTGRES_PASSWORD': 'briefer',
        'POSTGRES_HOSTNAME': 'localhost',
        'POSTGRES_PORT': '5432',
        'POSTGRES_DATABASE': 'briefer',
        'JUPYTER_TOKEN': get_random_secret(32),
        'AI_BASIC_AUTH_USERNAME': get_random_secret(8),
        'AI_BASIC_AUTH_PASSWORD': get_random_secret(8),
        'LOGIN_JWT_SECRET': get_random_secret(),
        'AUTH_JWT_SECRET': get_random_secret(),
        'ENVIRONMENT_VARIABLES_ENCRYPTION_KEY': get_random_secret(32),
        'DATASOURCES_ENCRYPTION_KEY': get_random_secret(32),
        'WORKSPACE_SECRETS_ENCRYPTION_KEY': get_random_secret(32),
    }


def generate_apps_config():
    fpath = get_config_path(APPS_CONFIG_DIR)
    cfg = generate_default_config()

    # override config with env vars
    for k, _ in cfg.items():
        if k in os.environ:
            cfg[k] = os.environ[k]

    with open(fpath, 'w') as f:
        json.dump(cfg, f, indent=4)
    os.chown(fpath, pwd.getpwnam('briefer').pw_uid, grp.getgrnam('briefer').gr_gid)
    os.chmod(fpath, 0o700)

    return cfg


def setup_apps():
    config_path = get_config_path(APPS_CONFIG_DIR)
    is_first_run = not config_path.exists()
    if is_first_run:
        logging.info('First run, generating apps config')
        cfg = generate_apps_config()
    else:
        logging.info('Apps config exists, loading')
        cfg = get_config(APPS_CONFIG_DIR)

    logging.info('Setting up postgres')
    while True:
        try:
            with psycopg2.connect(user='briefer', password='briefer', host='localhost', port='5432') as conn:
                break
        except:
            logging.info('Waiting for postgres to be ready')
            time.sleep(0.3)
            continue
    with psycopg2.connect(user='briefer', password='briefer', host='localhost', port='5432') as conn:
        logging.info('Postgres is ready')
        logging.info('Changing default user password')
        cur = conn.cursor()
        cur.execute(f"ALTER USER briefer WITH PASSWORD '{cfg['POSTGRES_PASSWORD']}'")
        conn.commit()
        logging.info('Password changed')

    run_migrations(cfg)

    return cfg


def generate_jupyter_config():
    fpath = get_config_path(JUPYTER_CONFIG_DIR)
    apps_cfg = get_config(APPS_CONFIG_DIR)
    cfg = {'JUPYTER_TOKEN': apps_cfg['JUPYTER_TOKEN']}
    with open(fpath, 'w') as f:
        json.dump(cfg, f, indent=4)

    # recursively chown jupyteruser home directory
    os.system('chown -R jupyteruser:jupyteruser /home/jupyteruser')
    os.system('chmod -R 700 /home/jupyteruser')


def setup_jupyter():
    generate_jupyter_config()


def run_migrations(cfg):
    logging.info('Running migrations')

    username = cfg['POSTGRES_USERNAME']
    password = cfg['POSTGRES_PASSWORD']
    hostname = cfg['POSTGRES_HOSTNAME']
    port = cfg['POSTGRES_PORT']
    database = cfg['POSTGRES_DATABASE']
    default_env = {
        'NODE_ENV': 'production',
        'POSTGRES_PRISMA_URL': f'postgresql://{username}:{password}@{hostname}:{port}/{database}?schema=public',
    }

    env = os.environ.copy()
    for k, v in default_env.items():
        if k not in env:
            env[k] = v

    migrations = subprocess.run(
        ['npx', 'prisma', 'migrate', 'deploy', '--schema', 'packages/database/prisma/schema.prisma'],
        env=env,
        cwd='/app/api/',
    )
    migrations.check_returncode()

    logging.info('Migrations done')


def main():
    logging.basicConfig(level=logging.INFO)
    logging.info('Starting setup')

    # create an empty file to signal that setup is running
    setups = [(APPS_CONFIG_DIR, 'briefer'), (JUPYTER_CONFIG_DIR, 'jupyteruser')]
    for dir, user in setups:
        os.makedirs(dir, exist_ok=True)
        path = Path(dir, 'setup')
        path.touch()
        os.chown(path, pwd.getpwnam(user).pw_uid, grp.getgrnam(user).gr_gid)

    setup_apps()
    setup_jupyter()

    for path, user in setups:
        Path(path, 'setup').unlink()

    logging.info('Setup finished')


if __name__ == '__main__':
    main()
