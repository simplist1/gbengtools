# Geodeta Field To Finish package prep

This folder is the staging template for the installer-ready AutoCAD bundle.

Expected final archive root:

```text
Geodeta.F2F.bundle/
  PackageContents.xml
  Contents/
    Windows/
      F2F.dll
```

Before publishing a release package:

1. Build the F2F plugin against .NET 10.
2. Place the release DLL at `Geodeta.F2F.bundle/Contents/Windows/F2F.dll` (rename the `ModuleName` in `PackageContents.xml` if the actual DLL uses a different filename).
3. Zip the **bundle folder itself** so the archive root contains `Geodeta.F2F.bundle`.
4. Publish the ZIP to a stable HTTPS URL.
5. Put that URL in the F2F manifest entry under `install.downloadUrl`.
6. Calculate the ZIP SHA-256 and put it in `install.sha256`.
7. If you want the installer to display or register commands later, add them to `install.commands`.

Compatibility intent is AutoCAD / Civil 3D 2026.2 and 2027. The manifest carries `minimumUpdate: "2026.2"` so the installer can become update-aware without losing that requirement. The current AutoCAD bundle `SeriesMin/SeriesMax` values identify the 2026/2027 product generations but do not themselves enforce the 2026.2 update level.
