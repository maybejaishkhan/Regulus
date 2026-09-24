const SCAN_SCRIPT = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$shell = New-Object -ComObject WScript.Shell',
    '$roots = @("$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs", "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs")',
    '$found = @()',
    'Get-ChildItem -Path $roots -Recurse -Filter *.lnk -File | ForEach-Object {',
    '  $link = $shell.CreateShortcut($_.FullName)',
    '  if ($link.TargetPath -and $link.TargetPath.ToLower().EndsWith(".exe")) {',
    '    $found += [pscustomobject]@{ name = $_.BaseName; command = $link.TargetPath; arguments = $link.Arguments }',
    '  }',
    '}',
    '$found | Sort-Object name -Unique | ConvertTo-Json -Compress',
].join('; ');

export function parseScanOutput(stdout) {
    const text = String(stdout ?? '').trim();
    if (text.length === 0)
        return [];

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        console.warn(`App scan returned unparseable JSON: ${error.message}`);
        return [];
    }

    const entries = Array.isArray(parsed) ? parsed : [parsed];

    return entries
        .filter((entry) => entry && typeof entry.name === 'string' && typeof entry.command === 'string')
        .map((entry) => ({
            name: entry.name.trim(),
            command: entry.command.trim(),
            arguments: String(entry.arguments ?? '').trim(),
        }))
        .filter((app) => app.name.length > 0 && app.command.toLowerCase().endsWith('.exe'));
}

export const MOCK_APPS = [
    { name: 'Notepad', command: 'C:\\Windows\\System32\\notepad.exe', arguments: '' },
    { name: 'Paint', command: 'C:\\Windows\\System32\\mspaint.exe', arguments: '' },
    { name: 'File Explorer', command: 'C:\\Windows\\explorer.exe', arguments: '' },
    { name: 'Command Prompt', command: 'C:\\Windows\\System32\\cmd.exe', arguments: '' },
    { name: 'Calculator', command: 'C:\\Windows\\System32\\calc.exe', arguments: '' },
];

export async function scanApps({ engine, container, mock = false }) {
    if (mock)
        return MOCK_APPS;

    const result = await engine.exec(container, [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        SCAN_SCRIPT,
    ]);

    if (!result.ok)
        return [];

    return parseScanOutput(result.stdout);
}