-- =============================================================================
-- Rede social de desenvolvedores
-- Arquivo: sql/social_network.sql
-- SGBD: PostgreSQL 14 ou superior
--
-- Cria o esquema completo: cadastro pessoal e profissional, postagens com
-- texto e link, amizades, seguidores, comentários, curtidas, mensagens
-- privadas, habilidades, grupos temáticos, desafios e ranking.
--
-- Como executar:
--   CREATE DATABASE social_network WITH ENCODING 'UTF8';
--   psql -d social_network -f sql/social_network.sql
--
-- O script pode ser executado de novo: ele recria tabelas, funções e views.
-- =============================================================================

SET client_encoding = 'UTF8';
SET client_min_messages = WARNING;

BEGIN;

-- -----------------------------------------------------------------------------
-- Limpeza para permitir reexecução
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_feed_seguindo;
DROP VIEW IF EXISTS vw_ranking;
DROP VIEW IF EXISTS vw_amizades;

DROP TABLE IF EXISTS
    rankings,
    solutions,
    challenge_participants,
    challenges,
    likes,
    comments,
    posts,
    group_members,
    groups,
    messages,
    conversations,
    follows,
    friends,
    user_skills,
    skills,
    users
CASCADE;

DROP FUNCTION IF EXISTS refresh_rankings();
DROP FUNCTION IF EXISTS set_updated_at();
DROP FUNCTION IF EXISTS enforce_post_group_membership();
DROP FUNCTION IF EXISTS enforce_comment_thread();
DROP FUNCTION IF EXISTS enforce_solution_rules();
DROP FUNCTION IF EXISTS enforce_message_participant();
DROP FUNCTION IF EXISTS enforce_unique_friendship();

-- -----------------------------------------------------------------------------
-- Usuários: dados pessoais e profissionais
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(150) NOT NULL,
    birth_date      DATE,
    phone           VARCHAR(20),
    bio             TEXT,
    avatar_url      VARCHAR(500),
    city            VARCHAR(100),
    state           VARCHAR(100),
    country         VARCHAR(100),
    job_title       VARCHAR(150),
    company         VARCHAR(150),
    education       VARCHAR(200),
    website         VARCHAR(500),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT users_username_uk UNIQUE (username),
    CONSTRAINT users_email_uk UNIQUE (email),
    CONSTRAINT users_username_chk CHECK (username ~ '^[A-Za-z0-9_\.]{3,50}$'),
    CONSTRAINT users_email_chk CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT users_birth_date_chk CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE),
    CONSTRAINT users_full_name_chk CHECK (char_length(btrim(full_name)) > 0)
);

COMMENT ON TABLE users IS 'Cadastro de usuários com informações pessoais e profissionais.';
COMMENT ON COLUMN users.password_hash IS 'Hash da senha. A senha em texto puro não é armazenada.';
COMMENT ON COLUMN users.job_title IS 'Cargo ou função profissional.';
COMMENT ON COLUMN users.education IS 'Formação acadêmica ou principal curso.';

-- -----------------------------------------------------------------------------
-- Habilidades de programação
-- -----------------------------------------------------------------------------
CREATE TABLE skills (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(80)  NOT NULL,
    category    VARCHAR(30)  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT skills_name_uk UNIQUE (name),
    CONSTRAINT skills_name_chk CHECK (char_length(btrim(name)) > 0),
    CONSTRAINT skills_category_chk CHECK (
        category IN ('linguagem', 'framework', 'banco_de_dados', 'ferramenta', 'outra')
    )
);

COMMENT ON TABLE skills IS 'Catálogo de habilidades de programação, linguagens e tecnologias.';

CREATE TABLE user_skills (
    user_id               BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    skill_id              BIGINT       NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
    proficiency_level     VARCHAR(20)  NOT NULL,
    years_of_experience   NUMERIC(4,1),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, skill_id),
    CONSTRAINT user_skills_level_chk CHECK (
        proficiency_level IN ('iniciante', 'intermediario', 'avancado', 'especialista')
    ),
    CONSTRAINT user_skills_years_chk CHECK (
        years_of_experience IS NULL OR years_of_experience >= 0
    )
);

COMMENT ON TABLE user_skills IS 'Habilidades de programação listadas por cada usuário.';

-- -----------------------------------------------------------------------------
-- Amizades e seguidores
-- -----------------------------------------------------------------------------
CREATE TABLE friends (
    id            BIGSERIAL PRIMARY KEY,
    requester_id  BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    addressee_id  BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status        VARCHAR(20)  NOT NULL DEFAULT 'pendente',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT friends_distinct_users_chk CHECK (requester_id <> addressee_id),
    CONSTRAINT friends_status_chk CHECK (
        status IN ('pendente', 'aceita', 'recusada', 'bloqueada')
    )
);

COMMENT ON TABLE friends IS 'Pedidos e relações de amizade entre dois usuários.';
COMMENT ON COLUMN friends.status IS 'pendente, aceita, recusada ou bloqueada.';

CREATE TABLE follows (
    follower_id   BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    following_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT follows_distinct_users_chk CHECK (follower_id <> following_id)
);

COMMENT ON TABLE follows IS 'Relação unilateral: um usuário segue outro para acompanhar as postagens.';

-- -----------------------------------------------------------------------------
-- Grupos temáticos
-- -----------------------------------------------------------------------------
CREATE TABLE groups (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    description TEXT,
    topic       VARCHAR(80)  NOT NULL,
    created_by  BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT groups_name_uk UNIQUE (name),
    CONSTRAINT groups_name_chk CHECK (char_length(btrim(name)) > 0),
    CONSTRAINT groups_topic_chk CHECK (char_length(btrim(topic)) > 0)
);

COMMENT ON TABLE groups IS 'Grupos temáticos sobre linguagens ou tecnologias.';
COMMENT ON COLUMN groups.topic IS 'Linguagem ou tecnologia tema do grupo, por exemplo PostgreSQL ou React.';

CREATE TABLE group_members (
    group_id   BIGINT       NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    user_id    BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role       VARCHAR(20)  NOT NULL DEFAULT 'membro',
    joined_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id),
    CONSTRAINT group_members_role_chk CHECK (role IN ('admin', 'moderador', 'membro'))
);

COMMENT ON TABLE group_members IS 'Participação dos usuários nos grupos e o papel de cada um.';

-- -----------------------------------------------------------------------------
-- Postagens, comentários e curtidas
-- -----------------------------------------------------------------------------
CREATE TABLE posts (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    group_id    BIGINT       REFERENCES groups (id) ON DELETE CASCADE,
    content     TEXT         NOT NULL,
    link_url    VARCHAR(500),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT posts_content_chk CHECK (char_length(btrim(content)) > 0),
    CONSTRAINT posts_link_url_chk CHECK (
        link_url IS NULL OR link_url ~* '^https?://'
    )
);

COMMENT ON TABLE posts IS 'Postagens com texto e link opcional. group_id nulo indica postagem de perfil; preenchido, postagem de grupo.';
COMMENT ON COLUMN posts.link_url IS 'Link associado à postagem. O texto continua obrigatório.';

CREATE TABLE comments (
    id                 BIGSERIAL PRIMARY KEY,
    post_id            BIGINT      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    user_id            BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    parent_comment_id  BIGINT      REFERENCES comments (id) ON DELETE CASCADE,
    content            TEXT        NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comments_content_chk CHECK (char_length(btrim(content)) > 0),
    CONSTRAINT comments_not_self_chk CHECK (parent_comment_id IS NULL OR parent_comment_id <> id)
);

COMMENT ON TABLE comments IS 'Comentários nas postagens. parent_comment_id permite respostas.';

CREATE TABLE likes (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    post_id     BIGINT      REFERENCES posts (id) ON DELETE CASCADE,
    comment_id  BIGINT      REFERENCES comments (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT likes_target_chk CHECK (
        (post_id IS NOT NULL AND comment_id IS NULL)
        OR (post_id IS NULL AND comment_id IS NOT NULL)
    )
);

COMMENT ON TABLE likes IS 'Curtidas em postagens ou em comentários. Cada registro aponta para apenas um dos dois.';

-- -----------------------------------------------------------------------------
-- Mensagens privadas
-- -----------------------------------------------------------------------------
CREATE TABLE conversations (
    id           BIGSERIAL PRIMARY KEY,
    user_low_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_high_id BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT conversations_ordered_users_chk CHECK (user_low_id < user_high_id),
    CONSTRAINT conversations_pair_uk UNIQUE (user_low_id, user_high_id)
);

COMMENT ON TABLE conversations IS 'Conversa privada única entre dois usuários. user_low_id guarda o menor id e user_high_id o maior.';

CREATE TABLE messages (
    id               BIGSERIAL PRIMARY KEY,
    conversation_id  BIGINT      NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    sender_id        BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    content          TEXT        NOT NULL,
    read_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT messages_content_chk CHECK (char_length(btrim(content)) > 0)
);

COMMENT ON TABLE messages IS 'Mensagens privadas enviadas dentro de uma conversa.';
COMMENT ON COLUMN messages.read_at IS 'Momento em que o destinatário leu a mensagem. Nulo significa não lida.';

-- -----------------------------------------------------------------------------
-- Desafios de programação e ranking
-- -----------------------------------------------------------------------------
CREATE TABLE challenges (
    id           BIGSERIAL PRIMARY KEY,
    title        VARCHAR(150) NOT NULL,
    description  TEXT         NOT NULL,
    statement    TEXT         NOT NULL,
    difficulty   VARCHAR(20)  NOT NULL,
    points       INTEGER      NOT NULL,
    starts_at    TIMESTAMPTZ,
    ends_at      TIMESTAMPTZ,
    created_by   BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT challenges_title_chk CHECK (char_length(btrim(title)) > 0),
    CONSTRAINT challenges_description_chk CHECK (char_length(btrim(description)) > 0),
    CONSTRAINT challenges_statement_chk CHECK (char_length(btrim(statement)) > 0),
    CONSTRAINT challenges_difficulty_chk CHECK (difficulty IN ('facil', 'medio', 'dificil')),
    CONSTRAINT challenges_points_chk CHECK (points >= 0),
    CONSTRAINT challenges_period_chk CHECK (
        starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at
    )
);

COMMENT ON TABLE challenges IS 'Desafios de programação dos quais os usuários podem participar.';
COMMENT ON COLUMN challenges.points IS 'Pontos concedidos quando uma solução é aceita.';

CREATE TABLE challenge_participants (
    challenge_id  BIGINT      NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
    user_id       BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (challenge_id, user_id)
);

COMMENT ON TABLE challenge_participants IS 'Inscrição dos usuários nos desafios.';

CREATE TABLE solutions (
    id            BIGSERIAL PRIMARY KEY,
    challenge_id  BIGINT       NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
    user_id       BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    source_code   TEXT         NOT NULL,
    language      VARCHAR(40)  NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'enviada',
    score         INTEGER,
    submitted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    evaluated_at  TIMESTAMPTZ,
    CONSTRAINT solutions_code_chk CHECK (char_length(btrim(source_code)) > 0),
    CONSTRAINT solutions_language_chk CHECK (char_length(btrim(language)) > 0),
    CONSTRAINT solutions_status_chk CHECK (
        status IN ('enviada', 'em_analise', 'aceita', 'rejeitada')
    ),
    CONSTRAINT solutions_score_chk CHECK (score IS NULL OR score >= 0)
);

COMMENT ON TABLE solutions IS 'Soluções enviadas pelos participantes de um desafio.';
COMMENT ON COLUMN solutions.score IS 'Pontuação da solução. Se o status for aceita e o score vier nulo, recebe os pontos do desafio.';

CREATE TABLE rankings (
    user_id               BIGINT      PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    total_points          INTEGER     NOT NULL DEFAULT 0,
    challenges_joined     INTEGER     NOT NULL DEFAULT 0,
    solutions_submitted   INTEGER     NOT NULL DEFAULT 0,
    solutions_accepted    INTEGER     NOT NULL DEFAULT 0,
    position              INTEGER     NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rankings_points_chk CHECK (total_points >= 0),
    CONSTRAINT rankings_joined_chk CHECK (challenges_joined >= 0),
    CONSTRAINT rankings_submitted_chk CHECK (solutions_submitted >= 0),
    CONSTRAINT rankings_accepted_chk CHECK (solutions_accepted >= 0),
    CONSTRAINT rankings_position_chk CHECK (position >= 1)
);

COMMENT ON TABLE rankings IS 'Ranking persistido. É recalculado quando o usuário entra, participa de um desafio ou envia solução.';
COMMENT ON COLUMN rankings.total_points IS '10 pontos por desafio em que participou + 5 por solução enviada + soma dos scores das soluções aceitas.';

-- -----------------------------------------------------------------------------
-- Índices de consulta
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX uq_likes_user_post
    ON likes (user_id, post_id)
    WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX uq_likes_user_comment
    ON likes (user_id, comment_id)
    WHERE comment_id IS NOT NULL;

CREATE INDEX idx_posts_user_created
    ON posts (user_id, created_at DESC);

CREATE INDEX idx_posts_group_created
    ON posts (group_id, created_at DESC)
    WHERE group_id IS NOT NULL;

CREATE INDEX idx_comments_post_created
    ON comments (post_id, created_at);

CREATE INDEX idx_comments_parent
    ON comments (parent_comment_id)
    WHERE parent_comment_id IS NOT NULL;

CREATE INDEX idx_likes_post
    ON likes (post_id)
    WHERE post_id IS NOT NULL;

CREATE INDEX idx_likes_comment
    ON likes (comment_id)
    WHERE comment_id IS NOT NULL;

CREATE INDEX idx_friends_requester
    ON friends (requester_id, status);

CREATE INDEX idx_friends_addressee
    ON friends (addressee_id, status);

CREATE INDEX idx_follows_following
    ON follows (following_id);

CREATE INDEX idx_user_skills_skill
    ON user_skills (skill_id);

CREATE INDEX idx_group_members_user
    ON group_members (user_id);

CREATE INDEX idx_messages_conversation
    ON messages (conversation_id, created_at);

CREATE INDEX idx_messages_unread
    ON messages (conversation_id)
    WHERE read_at IS NULL;

CREATE INDEX idx_challenge_participants_user
    ON challenge_participants (user_id);

CREATE INDEX idx_solutions_challenge_status
    ON solutions (challenge_id, status);

CREATE INDEX idx_solutions_user
    ON solutions (user_id, submitted_at DESC);

CREATE INDEX idx_rankings_position
    ON rankings (position);

-- -----------------------------------------------------------------------------
-- Regras de negócio
-- -----------------------------------------------------------------------------
CREATE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_unique_friendship()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM friends AS existing_friendship
        WHERE existing_friendship.id IS DISTINCT FROM NEW.id
          AND (
                (existing_friendship.requester_id = NEW.requester_id
                 AND existing_friendship.addressee_id = NEW.addressee_id)
             OR (existing_friendship.requester_id = NEW.addressee_id
                 AND existing_friendship.addressee_id = NEW.requester_id)
          )
    ) THEN
        RAISE EXCEPTION 'Já existe um pedido ou relação de amizade entre estes usuários.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_comment_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.parent_comment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM comments AS parent_comment
        WHERE parent_comment.id = NEW.parent_comment_id
          AND parent_comment.post_id = NEW.post_id
    ) THEN
        RAISE EXCEPTION 'A resposta precisa pertencer à mesma postagem do comentário original.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_post_group_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.group_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM group_members
        WHERE group_id = NEW.group_id
          AND user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'Apenas membros do grupo podem publicar nele.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_message_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    low_user_id BIGINT;
    high_user_id BIGINT;
BEGIN
    SELECT user_low_id, user_high_id
      INTO low_user_id, high_user_id
      FROM conversations
     WHERE id = NEW.conversation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversa privada não encontrada.';
    END IF;

    IF NEW.sender_id IS DISTINCT FROM low_user_id
       AND NEW.sender_id IS DISTINCT FROM high_user_id THEN
        RAISE EXCEPTION 'O remetente não participa desta conversa privada.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION enforce_solution_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    challenge_points INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM challenge_participants
        WHERE challenge_id = NEW.challenge_id
          AND user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'O usuário precisa participar do desafio antes de enviar uma solução.';
    END IF;

    IF NEW.status IN ('aceita', 'rejeitada') AND NEW.evaluated_at IS NULL THEN
        NEW.evaluated_at = NOW();
    END IF;

    IF NEW.status = 'aceita' AND NEW.score IS NULL THEN
        SELECT points
          INTO challenge_points
          FROM challenges
         WHERE id = NEW.challenge_id;

        NEW.score = challenge_points;
    END IF;

    RETURN NEW;
END;
$$;

-- Fórmula do ranking:
--   10 pontos por desafio em que o usuário participou
--   + 5 pontos por solução enviada
--   + soma dos scores das soluções aceitas
-- Desempate: mais soluções aceitas, depois mais participações, depois menor id.
CREATE FUNCTION refresh_rankings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM rankings AS stored_ranking
    WHERE NOT EXISTS (
        SELECT 1
        FROM users
        WHERE users.id = stored_ranking.user_id
    );

    INSERT INTO rankings (
        user_id,
        total_points,
        challenges_joined,
        solutions_submitted,
        solutions_accepted,
        position,
        updated_at
    )
    WITH participation AS (
        SELECT user_id, COUNT(*) AS challenges_joined
        FROM challenge_participants
        GROUP BY user_id
    ),
    submission AS (
        SELECT
            user_id,
            COUNT(*) AS solutions_submitted,
            COUNT(*) FILTER (WHERE status = 'aceita') AS solutions_accepted,
            COALESCE(SUM(score) FILTER (WHERE status = 'aceita'), 0) AS accepted_score
        FROM solutions
        GROUP BY user_id
    ),
    stats AS (
        SELECT
            users.id AS user_id,
            COALESCE(participation.challenges_joined, 0) AS challenges_joined,
            COALESCE(submission.solutions_submitted, 0) AS solutions_submitted,
            COALESCE(submission.solutions_accepted, 0) AS solutions_accepted,
            (
                COALESCE(participation.challenges_joined, 0) * 10
                + COALESCE(submission.solutions_submitted, 0) * 5
                + COALESCE(submission.accepted_score, 0)
            )::INTEGER AS total_points
        FROM users
        LEFT JOIN participation ON participation.user_id = users.id
        LEFT JOIN submission ON submission.user_id = users.id
    ),
    ranked AS (
        SELECT
            stats.user_id,
            stats.total_points,
            stats.challenges_joined,
            stats.solutions_submitted,
            stats.solutions_accepted,
            RANK() OVER (
                ORDER BY
                    stats.total_points DESC,
                    stats.solutions_accepted DESC,
                    stats.challenges_joined DESC,
                    stats.user_id ASC
            ) AS position
        FROM stats
    )
    SELECT
        user_id,
        total_points,
        challenges_joined,
        solutions_submitted,
        solutions_accepted,
        position,
        NOW()
    FROM ranked
    ON CONFLICT (user_id) DO UPDATE
        SET total_points = EXCLUDED.total_points,
            challenges_joined = EXCLUDED.challenges_joined,
            solutions_submitted = EXCLUDED.solutions_submitted,
            solutions_accepted = EXCLUDED.solutions_accepted,
            position = EXCLUDED.position,
            updated_at = NOW();

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_posts_set_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_comments_set_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_friends_set_updated_at
BEFORE UPDATE ON friends
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_groups_set_updated_at
BEFORE UPDATE ON groups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_challenges_set_updated_at
BEFORE UPDATE ON challenges
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_friends_unique_pair
BEFORE INSERT OR UPDATE ON friends
FOR EACH ROW EXECUTE FUNCTION enforce_unique_friendship();

CREATE TRIGGER trg_comments_thread
BEFORE INSERT OR UPDATE ON comments
FOR EACH ROW EXECUTE FUNCTION enforce_comment_thread();

CREATE TRIGGER trg_posts_group_member
BEFORE INSERT OR UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION enforce_post_group_membership();

CREATE TRIGGER trg_messages_participant
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION enforce_message_participant();

CREATE TRIGGER trg_solutions_rules
BEFORE INSERT OR UPDATE ON solutions
FOR EACH ROW EXECUTE FUNCTION enforce_solution_rules();

CREATE TRIGGER trg_users_refresh_rankings
AFTER INSERT OR DELETE ON users
FOR EACH STATEMENT EXECUTE FUNCTION refresh_rankings();

CREATE TRIGGER trg_participants_refresh_rankings
AFTER INSERT OR DELETE ON challenge_participants
FOR EACH STATEMENT EXECUTE FUNCTION refresh_rankings();

CREATE TRIGGER trg_solutions_refresh_rankings
AFTER INSERT OR UPDATE OR DELETE ON solutions
FOR EACH STATEMENT EXECUTE FUNCTION refresh_rankings();

-- -----------------------------------------------------------------------------
-- Consultas de apoio
-- -----------------------------------------------------------------------------
CREATE VIEW vw_amizades AS
SELECT requester_id AS user_id, addressee_id AS friend_id, created_at
FROM friends
WHERE status = 'aceita'
UNION
SELECT addressee_id, requester_id, created_at
FROM friends
WHERE status = 'aceita';

COMMENT ON VIEW vw_amizades IS 'Amizades aceitas nos dois sentidos, para consultar os amigos de um usuário.';

CREATE VIEW vw_ranking AS
SELECT
    rankings.position,
    rankings.user_id,
    users.username,
    users.full_name,
    rankings.total_points,
    rankings.challenges_joined,
    rankings.solutions_submitted,
    rankings.solutions_accepted,
    rankings.updated_at
FROM rankings
JOIN users ON users.id = rankings.user_id;

COMMENT ON VIEW vw_ranking IS 'Ranking com o nome dos usuários. Ordene por position para exibir a classificação.';

CREATE VIEW vw_feed_seguindo AS
SELECT
    follows.follower_id,
    posts.id AS post_id,
    posts.user_id AS author_id,
    users.username AS author_username,
    posts.content,
    posts.link_url,
    posts.created_at
FROM follows
JOIN posts
  ON posts.user_id = follows.following_id
 AND posts.group_id IS NULL
JOIN users ON users.id = posts.user_id;

COMMENT ON VIEW vw_feed_seguindo IS 'Postagens de perfil publicadas pelos usuários seguidos.';

COMMIT;
