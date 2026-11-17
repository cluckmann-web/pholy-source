export const getPholyCollectionCopy = (language: string) =>
  language.startsWith('de')
    ? {
        albumsDescription: 'Ordne deine Fotos in Alben und finde deine Sammlungen schnell wieder.',
        settingsDescription: 'Dein Profil, deine bevorzugte Ansicht und dein Kontozugriff an einem Ort.',
        accountEyebrow: 'Dein PHOLY-Konto',
        profileGroup: 'Profil & Freigaben',
        profileGroupDescription: 'Deine Angaben, geteilte Inhalte und Speicherplatz.',
        preferencesGroup: 'Deine Ansicht',
        preferencesGroupDescription: 'Darstellung, Funktionen und Benachrichtigungen für deinen Alltag.',
        securityGroup: 'Sicherheit & Verbindungen',
        securityGroupDescription: 'Verwalte deine Anmeldung und die Geräte mit Zugriff auf dein Konto.',
        advancedGroup: 'Weitere Einstellungen',
        advancedGroupDescription: 'Schnittstellen und Lizenzinformationen.',
        technicalDetails: 'Technische Kontodaten',
      }
    : {
        albumsDescription: 'Organize your photos into albums and keep your collections easy to find.',
        settingsDescription: 'Your profile, preferred view and account access in one place.',
        accountEyebrow: 'Your PHOLY account',
        profileGroup: 'Profile & sharing',
        profileGroupDescription: 'Your details, shared content and storage.',
        preferencesGroup: 'Your experience',
        preferencesGroupDescription: 'Display, features and notifications for everyday use.',
        securityGroup: 'Security & connections',
        securityGroupDescription: 'Manage your sign-in options and devices with access to your account.',
        advancedGroup: 'More settings',
        advancedGroupDescription: 'Integrations and license information.',
        technicalDetails: 'Technical account details',
      };
