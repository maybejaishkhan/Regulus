import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const APP_DATA_DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'regulus']);
const NAME_RE = /^[a-zA-Z0-9._-]+$/;

export class ProfileStore {
    constructor({ dir = GLib.build_filenamev([APP_DATA_DIR, 'profiles']) } = {}) {
        this.dir = dir;
    }

    _dirFile() {
        return Gio.File.new_for_path(this.dir);
    }

    _ensureDir() {
        const dir = this._dirFile();
        if (dir.query_exists(null))
            return dir;
        dir.make_directory_with_parents(null);
        return dir;
    }

    _fileFor(name) {
        if (typeof name !== 'string' || !NAME_RE.test(name))
            throw new Error(`Invalid profile name: ${JSON.stringify(name)}`);
        return Gio.File.new_for_path(GLib.build_filenamev([this.dir, `${name}.json`]));
    }

    list() {
        this._ensureDir();

        const enumerator = this._dirFile().enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NONE,
            null,
        );

        const names = [];
        for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
            const fileName = info.get_name();
            if (fileName.endsWith('.json'))
                names.push(fileName.slice(0, -5));
        }
        enumerator.close(null);

        return names.sort();
    }

    get(name) {
        const file = this._fileFor(name);
        if (!file.query_exists(null))
            return null;

        const [ok, bytes] = file.load_contents(null);
        if (!ok)
            return null;

        try {
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch (error) {
            console.warn(`Profile "${name}" is not valid JSON: ${error.message}`);
            return null;
        }
    }

    save(profile) {
        if (!profile || typeof profile.name !== 'string' || profile.name.length === 0)
            throw new Error('Profile requires a non-empty name');

        this._ensureDir();

        const file = this._fileFor(profile.name);
        file.replace_contents(
            `${JSON.stringify(profile, null, 2)}\n`,
            null,
            false,
            Gio.FileCreateFlags.NONE,
            null,
        );

        return profile;
    }

    remove(name) {
        const file = this._fileFor(name);
        if (file.query_exists(null))
            file.delete(null);
    }
}
