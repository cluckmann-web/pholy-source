package app.alextran.immich.updates

import androidx.core.content.FileProvider

/** A separate authority keeps update APKs apart from media-sharing providers. */
class PholyUpdateFileProvider : FileProvider()
