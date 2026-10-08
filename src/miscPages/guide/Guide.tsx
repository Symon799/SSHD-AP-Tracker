import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './Guide.module.css';

function Heading({
    level,
    id,
    children,
}: {
    level: 1 | 2 | 3;
    id?: string;
    children: ReactNode;
}) {
    const Tag = `h${level}` as const;
    return (
        <Tag id={id} className={styles.guideSection}>
            {children}
        </Tag>
    );
}

function Section({ children }: { children: ReactNode }) {
    return <section className={styles.guideSection}>{children}</section>;
}

export default function Guide() {
    return (
        <div className={styles.guidePage}>
            <div className={styles.guideContent}>
                <Heading level={1}>Guide du tracker SSHD AP</Heading>
                <Section>
                    <p>
                        Ce tracker est dédié à <strong>Skyward Sword HD</strong>{' '}
                        en multijoueur <strong>Archipelago</strong>. Il
                        reconstruit la logique locale à partir des réglages de
                        la seed, suit les emplacements cochés, les donjons
                        requis et l’état des objets reçus depuis le serveur.
                    </p>
                    <p>
                        <Link to="/">← Retour à la connexion</Link>
                    </p>
                </Section>

                <Heading level={2} id="demarrer">
                    Démarrer une session
                </Heading>
                <Section>
                    <ol>
                        <li>
                            Connectez-vous à votre serveur Archipelago avec
                            l’adresse, le slot et le mot de passe éventuel.
                        </li>
                        <li>
                            Utilisez <strong>Continue Tracker</strong> pour
                            reprendre la progression déjà enregistrée dans le
                            navigateur, y compris les emplacements cochés
                            manuellement et les donjons requis.
                        </li>
                        <li>
                            Utilisez <strong>Launch New Tracker</strong> pour
                            repartir de zéro avec les réglages et la progression
                            Archipelago actuels du serveur.
                        </li>
                        <li>
                            Marquez manuellement les donjons requis tant que la
                            seed ne fournit pas encore la liste exacte.
                        </li>
                    </ol>
                </Section>

                <Heading level={2} id="progression">
                    Sauvegarde et reprise
                </Heading>
                <Section>
                    <p>
                        La progression est conservée automatiquement dans le
                        navigateur : emplacements cochés, inventaire local,
                        donjons requis, sorties mappées et texte d’indices.
                    </p>
                    <p>
                        Dans <strong>Server &amp; Tools</strong>, les boutons{' '}
                        <strong>Export State</strong> et{' '}
                        <strong>Import State</strong> permettent de sauvegarder
                        ou restaurer manuellement cette progression.{' '}
                        <strong>UT Snapshot</strong> reste un export de
                        diagnostic pour comparer la logique avec Universal
                        Tracker.
                    </p>
                </Section>

                <Heading level={2} id="carte">
                    Carte et listes
                </Heading>
                <Section>
                    <p>
                        Le mode carte est le mode principal. Le mode liste
                        conserve la même logique, avec un séparateur
                        redimensionnable entre la liste des régions et la liste
                        des emplacements.
                    </p>
                    <p>
                        Un clic gauche sur une région ouvre ses emplacements.
                        Quand le mode debug est actif, le clic droit sert au
                        repositionnement des marqueurs de carte.
                    </p>
                </Section>

                <Heading level={2} id="customisation">
                    Personnalisation
                </Heading>
                <Section>
                    <p>
                        Le panneau <strong>Customization</strong> permet de
                        choisir la disposition des objets et des lieux,
                        d’activer la semi-logique et les tricks, et d’ajuster
                        les couleurs en bas du panneau.
                    </p>
                </Section>

                <Heading level={2} id="autotracking">
                    Autotracking Archipelago
                </Heading>
                <Section>
                    <p>
                        Les objets reçus et les emplacements cochés côté
                        Archipelago sont appliqués automatiquement lorsque la
                        connexion est active. Vous pouvez encore cocher ou
                        décocher manuellement des emplacements pour corriger un
                        écart ponctuel.
                    </p>
                </Section>
            </div>
        </div>
    );
}
