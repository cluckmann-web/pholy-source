/// PHOLY's community is an explicit publication layer over the existing library.
/// These models deliberately contain no original paths, owner IDs or EXIF data.
class CommunityProfile {
  const CommunityProfile({required this.slug, required this.displayName, required this.bio});

  final String slug;
  final String displayName;
  final String bio;

  factory CommunityProfile.fromJson(Map<String, dynamic> json) => CommunityProfile(
    slug: json['slug'] as String,
    displayName: json['displayName'] as String,
    bio: json['bio'] as String? ?? '',
  );
}

class CommunityDirectory {
  const CommunityDirectory({required this.profiles, required this.nextOffset});
  final List<CommunityProfile> profiles;
  final int? nextOffset;

  factory CommunityDirectory.fromJson(Map<String, dynamic> json) => CommunityDirectory(
    profiles: (json['profiles'] as List)
        .map((value) => CommunityProfile.fromJson(value as Map<String, dynamic>))
        .toList(),
    nextOffset: (json['nextOffset'] as num?)?.toInt(),
  );
}

class CommunityGallery {
  const CommunityGallery({required this.profile, required this.assetIds, required this.followers});
  final CommunityProfile profile;
  final List<String> assetIds;
  final int followers;

  factory CommunityGallery.fromJson(Map<String, dynamic> json) => CommunityGallery(
    profile: CommunityProfile.fromJson(json),
    assetIds: (json['assets'] as List).map((value) => (value as Map<String, dynamic>)['id'] as String).toList(),
    followers: (json['followers'] as num).toInt(),
  );
}

class CommunityRelation {
  const CommunityRelation({required this.following, required this.ownProfile});
  final bool following;
  final bool ownProfile;

  factory CommunityRelation.fromJson(Map<String, dynamic> json) =>
      CommunityRelation(following: json['following'] == true, ownProfile: json['ownProfile'] == true);
}

class CommunityPhoto {
  const CommunityPhoto({required this.id, required this.originalFileName, this.hidden = false});
  final String id;
  final String originalFileName;
  final bool hidden;

  factory CommunityPhoto.fromJson(Map<String, dynamic> json) => CommunityPhoto(
    id: (json['id'] ?? json['assetId']) as String,
    originalFileName: json['originalFileName'] as String,
    hidden: json['hidden'] == true,
  );
}

class CommunityMine {
  const CommunityMine({required this.profile, required this.published, required this.blocked, required this.assets});
  final CommunityProfile? profile;
  final bool published;
  final bool blocked;
  final List<CommunityPhoto> assets;

  factory CommunityMine.fromJson(Map<String, dynamic> json) {
    final profile = json['profile'] as Map<String, dynamic>?;
    return CommunityMine(
      profile: profile == null ? null : CommunityProfile.fromJson(profile),
      published: profile?['published'] == true,
      blocked: profile?['blocked'] == true,
      assets: (json['assets'] as List).map((value) => CommunityPhoto.fromJson(value as Map<String, dynamic>)).toList(),
    );
  }
}

class CommunityPhotoPage {
  const CommunityPhotoPage({required this.assets, required this.nextOffset});
  final List<CommunityPhoto> assets;
  final int? nextOffset;

  factory CommunityPhotoPage.fromJson(Map<String, dynamic> json) => CommunityPhotoPage(
    assets: (json['assets'] as List).map((value) => CommunityPhoto.fromJson(value as Map<String, dynamic>)).toList(),
    nextOffset: (json['nextOffset'] as num?)?.toInt(),
  );
}

enum CommunityReportReason { privacy, copyright, abuse, other }

/// Mirrors the server's existing slug validation; it does not create a new identity.
bool isCommunitySlugValid(String value) => RegExp(r'^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$').hasMatch(value);
