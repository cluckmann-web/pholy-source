/// PHOLY discussions are separate from Immich's album activity API.
/// A context can carry exactly one scope; in particular, `slug` must never be
/// sent, because Immich reserves it for shared-link authentication.
enum PhotoCommentKind { private, album, community }

class PhotoCommentContext {
  final PhotoCommentKind kind;
  final String? albumId;
  final String? profileSlug;

  const PhotoCommentContext.private() : kind = PhotoCommentKind.private, albumId = null, profileSlug = null;
  const PhotoCommentContext.album(String id) : kind = PhotoCommentKind.album, albumId = id, profileSlug = null;
  const PhotoCommentContext.community(String slug)
    : kind = PhotoCommentKind.community,
      albumId = null,
      profileSlug = slug;

  Map<String, String> toJson() => switch (kind) {
    PhotoCommentKind.private => {'kind': 'private'},
    PhotoCommentKind.album => {'kind': 'album', 'albumId': albumId!},
    PhotoCommentKind.community => {'kind': 'community', 'profileSlug': profileSlug!},
  };

  @override
  bool operator ==(Object other) =>
      other is PhotoCommentContext &&
      kind == other.kind &&
      albumId == other.albumId &&
      profileSlug == other.profileSlug;

  @override
  int get hashCode => Object.hash(kind, albumId, profileSlug);
}

class PhotoCommentAuthor {
  final String id;
  final String name;
  final String avatarColor;
  final bool hasProfileImage;

  const PhotoCommentAuthor({
    required this.id,
    required this.name,
    required this.avatarColor,
    required this.hasProfileImage,
  });

  factory PhotoCommentAuthor.fromJson(Map<String, dynamic> json) => PhotoCommentAuthor(
    id: json['id'] as String,
    name: json['name'] as String,
    avatarColor: json['avatarColor'] as String? ?? 'primary',
    hasProfileImage: json['hasProfileImage'] == true,
  );
}

class PhotoComment {
  final String id;
  final String assetId;
  final String? parentId;
  final String body;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool deleted;
  final PhotoCommentAuthor? author;
  final int likeCount;
  final bool liked;
  final bool canEdit;
  final bool canDelete;
  final List<PhotoComment> replies;

  const PhotoComment({
    required this.id,
    required this.assetId,
    required this.parentId,
    required this.body,
    required this.createdAt,
    required this.updatedAt,
    required this.deleted,
    required this.author,
    required this.likeCount,
    required this.liked,
    required this.canEdit,
    required this.canDelete,
    required this.replies,
  });

  factory PhotoComment.fromJson(Map<String, dynamic> json) {
    final deleted = json['deleted'] == true;
    final author = json['author'] as Map<String, dynamic>?;
    return PhotoComment(
      id: json['id'] as String,
      assetId: json['assetId'] as String,
      parentId: json['parentId'] as String?,
      body: deleted ? '' : json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      deleted: deleted,
      author: deleted || author == null ? null : PhotoCommentAuthor.fromJson(author),
      likeCount: deleted ? 0 : (json['likeCount'] as num? ?? 0).toInt(),
      liked: !deleted && json['liked'] == true,
      canEdit: !deleted && json['canEdit'] == true,
      canDelete: !deleted && json['canDelete'] == true,
      replies: List.unmodifiable(
        (json['replies'] as List<dynamic>? ?? []).map((reply) => PhotoComment.fromJson(reply as Map<String, dynamic>)),
      ),
    );
  }
}

class PhotoCommentsPage {
  final List<PhotoComment> comments;
  final int? nextOffset;
  final int total;
  final bool canComment;

  const PhotoCommentsPage({
    required this.comments,
    required this.nextOffset,
    required this.total,
    required this.canComment,
  });

  factory PhotoCommentsPage.fromJson(Map<String, dynamic> json) => PhotoCommentsPage(
    comments: List.unmodifiable(
      (json['comments'] as List<dynamic>).map((comment) => PhotoComment.fromJson(comment as Map<String, dynamic>)),
    ),
    nextOffset: (json['nextOffset'] as num?)?.toInt(),
    total: (json['total'] as num).toInt(),
    canComment: json['canComment'] == true,
  );
}
