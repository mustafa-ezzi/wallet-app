import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { apiErrorMessage, peopleApi } from '@/src/api/client'
import { ErrorBanner, Field, PrimaryButton } from '@/src/components/ui'
import { useColors } from '@/src/theme/ThemeContext'
import { radii, spacing, typography, type ColorTokens } from '@/src/theme/colors'

type Mode = 'local' | 'invite' | 'code'

type Props = {
  visible: boolean
  onClose: () => void
  /** Convert an existing local person into a linked invite (hides Local tab). */
  existingPersonId?: number | null
  defaultDisplayName?: string
  /** Called after a local person is created (with new person id) or a link invite is sent. */
  onDone: (result: { kind: 'local'; personId: number; name: string } | { kind: 'invite' } | { kind: 'join' }) => void
}

export function InvitePersonSheet({
  visible,
  onClose,
  onDone,
  existingPersonId = null,
  defaultDisplayName = '',
}: Props) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const convertMode = Boolean(existingPersonId)

  const [mode, setMode] = useState<Mode>('local')
  const [localName, setLocalName] = useState('')
  const [query, setQuery] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [myCode, setMyCode] = useState('')
  const [loading, setLoading] = useState(false)
  const loadingRef = useRef(false)
  const [codeBusy, setCodeBusy] = useState(false)
  const [error, setError] = useState('')

  const loadCode = useCallback(async () => {
    setCodeBusy(true)
    try {
      const { data } = await peopleApi.linkCode()
      setMyCode(data?.code || '')
    } catch {
      setMyCode('')
    } finally {
      setCodeBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    setError('')
    setLocalName('')
    setQuery('')
    setDisplayName(defaultDisplayName || '')
    setJoinCode('')
    setMode(convertMode ? 'invite' : 'local')
    void loadCode()
  }, [visible, loadCode, convertMode, defaultDisplayName])

  const submitLocal = async () => {
    if (loadingRef.current) return
    const n = localName.trim()
    if (!n) {
      setError('Enter a person name.')
      return
    }
    loadingRef.current = true
    setLoading(true)
    setError('')
    try {
      const { data } = await peopleApi.create({ name: n })
      onDone({ kind: 'local', personId: data.id, name: data.name || n })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create person.'))
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  const submitInvite = async () => {
    if (loadingRef.current) return
    const q = query.trim()
    if (!q) {
      setError('Enter their email or username.')
      return
    }
    loadingRef.current = true
    setLoading(true)
    setError('')
    try {
      await peopleApi.invite({
        query: q,
        display_name: displayName.trim() || undefined,
        ...(existingPersonId ? { existing_person_id: existingPersonId } : {}),
      })
      onDone({ kind: 'invite' })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send link request.'))
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  const submitJoin = async () => {
    if (loadingRef.current) return
    const code = joinCode.trim().toUpperCase()
    if (!code) {
      setError('Enter a people link code.')
      return
    }
    loadingRef.current = true
    setLoading(true)
    setError('')
    try {
      await peopleApi.joinByCode({
        code,
        display_name: displayName.trim() || undefined,
        ...(existingPersonId ? { existing_person_id: existingPersonId } : {}),
      })
      onDone({ kind: 'join' })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not request link with that code.'))
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  const shareCode = async () => {
    if (!myCode) return
    try {
      await Share.share({
        message: `Link with me on WalletTrails for lend/borrow. My code: ${myCode}`,
      })
    } catch {
      /* ignore */
    }
  }

  const regenerate = async () => {
    setCodeBusy(true)
    setError('')
    try {
      const { data } = await peopleApi.regenerateLinkCode()
      setMyCode(data?.code || '')
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not regenerate code.'))
    } finally {
      setCodeBusy(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.head}>
            <Text style={styles.title}>{convertMode ? 'Link this person' : 'Add person'}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <FontAwesome name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.seg}>
            {(convertMode
              ? [
                  { key: 'invite' as const, label: 'Invite user' },
                  { key: 'code' as const, label: 'Code' },
                ]
              : [
                  { key: 'local' as const, label: 'Local' },
                  { key: 'invite' as const, label: 'Invite user' },
                  { key: 'code' as const, label: 'Code' },
                ]
            ).map((t) => (
              <Pressable
                key={t.key}
                onPress={() => { setMode(t.key); setError('') }}
                style={[styles.segBtn, mode === t.key && styles.segOn]}
              >
                <Text style={[styles.segText, mode === t.key && styles.segTextOn]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <ErrorBanner message={error} />

            {convertMode ? (
              <Text style={styles.hint}>
                Keep this person’s history and invite a WalletTrails user to link.
              </Text>
            ) : null}

            {mode === 'local' && !convertMode ? (
              <>
                <Text style={styles.hint}>
                  For people not on WalletTrails (e.g. Idrees). You post entries alone.
                </Text>
                <Field
                  label="Name"
                  value={localName}
                  onChangeText={setLocalName}
                  placeholder="Idrees"
                  autoCapitalize="words"
                />
                <PrimaryButton title="Create local person" onPress={() => void submitLocal()} loading={loading} />
              </>
            ) : null}

            {mode === 'invite' ? (
              <>
                <Text style={styles.hint}>
                  Type their WalletTrails email or username. They’ll get a link request to accept.
                </Text>
                <Field
                  label="Email or username"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="hussain@mail.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <Field
                  label="Name on your list (optional)"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Hussain"
                  autoCapitalize="words"
                />
                <PrimaryButton title="Send link request" onPress={() => void submitInvite()} loading={loading} />
              </>
            ) : null}

            {mode === 'code' ? (
              <>
                <Text style={styles.hint}>Share your code, or enter theirs to request a link.</Text>

                <View style={[styles.codeCard, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                  <Text style={styles.codeLabel}>Your code</Text>
                  {codeBusy && !myCode ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.codeValue}>{myCode || '—'}</Text>
                  )}
                  <View style={styles.codeActions}>
                    <Pressable style={[styles.codeBtn, { backgroundColor: colors.primary }]} onPress={() => void shareCode()}>
                      <Text style={styles.codeBtnText}>Share</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.codeBtn, { borderColor: colors.border, borderWidth: 1 }]}
                      onPress={() => void regenerate()}
                    >
                      <Text style={[styles.codeBtnText, { color: colors.text }]}>New code</Text>
                    </Pressable>
                  </View>
                </View>

                <Field
                  label="Their code"
                  value={joinCode}
                  onChangeText={(t) => setJoinCode(t.toUpperCase())}
                  placeholder="PEEP-XXXXXX"
                  autoCapitalize="characters"
                />
                <Field
                  label="Name on your list (optional)"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Hussain"
                  autoCapitalize="words"
                />
                <PrimaryButton title="Request link with code" onPress={() => void submitJoin()} loading={loading} />
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,31,26,0.45)' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
      maxHeight: '90%',
      zIndex: 2,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    title: { fontSize: typography.title, fontWeight: '800', color: colors.primaryDark },
    seg: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
    segBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    segOn: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
    segText: { fontWeight: '700', color: colors.textSecondary, fontSize: 12 },
    segTextOn: { color: colors.white },
    hint: {
      color: colors.textMuted,
      fontWeight: '600',
      fontSize: typography.caption,
      marginBottom: spacing.md,
      lineHeight: 18,
    },
    codeCard: {
      borderWidth: 1,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      alignItems: 'center',
    },
    codeLabel: { color: colors.textMuted, fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
    codeValue: { fontWeight: '800', fontSize: 22, color: colors.text, marginVertical: 8, letterSpacing: 1 },
    codeActions: { flexDirection: 'row', gap: 8 },
    codeBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radii.sm,
      minWidth: 88,
      alignItems: 'center',
    },
    codeBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  })
}
